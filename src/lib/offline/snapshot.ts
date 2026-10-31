import { create } from "zustand";
import { ZatGoApi } from "@zatgo/erpnext";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import { useSessionStore } from "@/store/session";
import { useSiteStore } from "@/store/site";
import { offlineBridge } from "./bridge.ts";
import { useConnectivity } from "./connectivity.ts";
import { snapshotDue } from "./limits.ts";
import { fromFull, maxModified, mergeDelta, pullAllPages, type SnapRow } from "./snapshot-merge.ts";
import { POS_SETTINGS_METHOD, persistRawSettings, usePosSettings } from "./settings.ts";

/** Items and customers saved on this device (read-only copies of what the site owns). */
type RowSnap = { scope: string; mode: string; fetchedAt: number; fullAt: number; cursor: string | null; rows: SnapRow[] };

const FULL_REFRESH_MS = 12 * 3_600_000;

type SnapshotStore = {
  catalogAt: number | null;
  customersAt: number | null;
  refreshing: boolean;
  error: string | null;
};

export const useSnapshot = create<SnapshotStore>(() => ({
  catalogAt: null,
  customersAt: null,
  refreshing: false,
  error: null,
}));

/** The age base used by the offline limits: the oldest of the pieces a sale needs. */
export function snapshotFetchedAt(): number | null {
  const { catalogAt } = useSnapshot.getState();
  const profileAt = useSiteStore.getState().profileAt;
  if (catalogAt === null || profileAt === null) return null;
  return Math.min(catalogAt, profileAt);
}

export function currentScope(): string {
  return useSessionStore.getState().connection.baseUrl.trim().replace(/\/$/, "").toLowerCase();
}

const currentMode = () => useSiteStore.getState().profile?.posMode ?? null;

const cache: { catalog?: RowSnap | null; customers?: RowSnap | null } = {};

async function readSnap(name: "catalog" | "customers"): Promise<RowSnap | null> {
  const b = offlineBridge();
  if (!b) return null;
  const snap = (await b.offlineSnapshotGet(name)) as RowSnap | null;
  const mode = currentMode();
  return snap && snap.scope === currentScope() && Array.isArray(snap.rows) && (!mode || snap.mode === mode) ? snap : null;
}

async function getSnap(name: "catalog" | "customers"): Promise<RowSnap | null> {
  if (cache[name] === undefined) cache[name] = await readSnap(name).catch(() => null);
  return cache[name] ?? null;
}

export async function getCatalogRows(): Promise<SnapRow[] | null> {
  return (await getSnap("catalog"))?.rows ?? null;
}

export async function getCustomerRows(): Promise<SnapRow[] | null> {
  return (await getSnap("customers"))?.rows ?? null;
}

export function dropSnapshotCache(): void {
  cache.catalog = undefined;
  cache.customers = undefined;
}

/** Read the saved times (after a restart) so the banner and limits know the snapshot age. */
export async function loadSnapshotMeta(): Promise<void> {
  const [cat, cus] = await Promise.all([getSnap("catalog"), getSnap("customers")]);
  useSnapshot.setState((s) => ({
    catalogAt: cat?.fetchedAt ?? s.catalogAt,
    customersAt: cus?.fetchedAt ?? s.customersAt,
  }));
}

function api() {
  return useSiteStore.getState().profile?.posMode === "retail" ? ZatGoApi.retailPos : ZatGoApi.restoPos;
}

async function pullRows(method: string, extra: Record<string, unknown>): Promise<SnapRow[]> {
  return pullAllPages(async (page) => {
    const env = await callZatGoApi<unknown[]>(method, { ...extra, page, page_size: 100 });
    return Array.isArray(env.data) ? (env.data as SnapRow[]) : [];
  });
}

async function refreshRows(name: "catalog" | "customers", method: string, supportsDelta: boolean): Promise<void> {
  const scope = currentScope();
  const prev = await getSnap(name);
  const now = Date.now();
  let rows: SnapRow[] | null = null;
  let fullAt = prev?.fullAt ?? 0;
  let cursor = prev?.cursor ?? null;

  if (supportsDelta && prev && cursor && now - prev.fullAt < FULL_REFRESH_MS) {
    try {
      const delta = await pullRows(method, { modified_since: cursor, include_disabled: 1 });
      rows = mergeDelta(prev.rows, delta);
      cursor = maxModified(delta, cursor);
    } catch {
      rows = null; // a failed delta falls back to a full refresh
    }
  }
  if (!rows) {
    rows = fromFull(await pullRows(method, {}));
    fullAt = now;
    cursor = maxModified(rows, null);
  }
  const snap: RowSnap = { scope, mode: currentMode() ?? "", fetchedAt: now, fullAt, cursor, rows };
  await offlineBridge()?.offlineSnapshotSet(name, snap);
  cache[name] = snap;
  useSnapshot.setState(name === "catalog" ? { catalogAt: now } : { customersAt: now });
}

async function refreshSettings(): Promise<void> {
  const env = await callZatGoApi<Record<string, unknown>>(POS_SETTINGS_METHOD, {});
  const now = Date.now();
  usePosSettings.getState().apply(env.data ?? {}, now, "server");
  await persistRawSettings(currentScope(), env.data ?? {}, now);
}

let inFlight: Promise<void> | null = null;

/**
 * Refresh settings, profile, catalog and customers. Each part fails on its own (the old copy is kept).
 * Not forced: skipped while the snapshot is younger than `snapshot_refresh_minutes`.
 */
export function refreshSnapshot(opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!offlineBridge()) return Promise.resolve();
  if (useConnectivity.getState().net !== "online") return Promise.resolve();
  if (!useSessionStore.getState().connected) return Promise.resolve();
  const settings = usePosSettings.getState().settings.offline;
  if (!opts.force && !snapshotDue(snapshotFetchedAt(), settings, Date.now())) return Promise.resolve();

  inFlight = (async () => {
    useSnapshot.setState({ refreshing: true });
    const errors: string[] = [];
    const step = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
      }
    };
    await step("settings", refreshSettings);
    await step("profile", async () => {
      await useSiteStore.getState().refresh();
    });
    const retail = useSiteStore.getState().profile?.posMode === "retail";
    await step("items", () => refreshRows("catalog", api().catalogList, retail));
    await step("customers", () => refreshRows("customers", api().customersList, retail));
    useSnapshot.setState({ refreshing: false, error: errors.length ? errors.join("; ") : null });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Refresh on login, on reconnect and every `snapshot_refresh_minutes`. */
export function startSnapshotRefresh(): void {
  if (timer) return;
  void refreshSnapshot({ force: true });
  let last = useConnectivity.getState().net;
  useConnectivity.subscribe((s) => {
    if (s.net === "online" && last !== "online") void refreshSnapshot({ force: true });
    last = s.net;
  });
  let wasConnected = useSessionStore.getState().connected;
  useSessionStore.subscribe((s) => {
    if (s.connected && !wasConnected) void refreshSnapshot({ force: true });
    wasConnected = s.connected;
  });
  timer = setInterval(() => void refreshSnapshot(), 60_000);
}

export function stopSnapshotRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
