import { create } from "zustand";
import { toast } from "sonner";
import { ZatGoApi } from "@zatgo/erpnext";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import { queryClient } from "@/lib/query-client";
import { useSessionStore } from "@/store/session";
import { offlineBridge } from "./bridge.ts";
import { classifyFailure, failureInfo } from "./classify.ts";
import { useConnectivity } from "./connectivity.ts";
import {
  markNeedsAttention,
  markPaused,
  markRetry,
  markRetryNow,
  markSending,
  markSynced,
  nextDue,
} from "./outbox-state.ts";
import { pruneOutbox, useOutbox } from "./outbox.ts";
import type { OutboxRecord, SaleIssue } from "./types.ts";

export type SyncStatus = "idle" | "syncing" | "offline" | "paused-auth" | "paused-off" | "wrong-user";

type SyncStore = { status: SyncStatus; message: string | null; lastRunAt: number | null };

export const useSyncStatus = create<SyncStore>(() => ({ status: "idle", message: null, lastRunAt: null }));

const setStatus = (status: SyncStatus, message: string | null = null) =>
  useSyncStatus.setState({ status, message });

export const normalizeSite = (url: string) => url.trim().replace(/\/$/, "").toLowerCase();

type PostResult = { invoice: string; review: boolean; issues: SaleIssue[] };

function readOfflineMeta(meta: Record<string, unknown> | undefined): { review: boolean; issues: SaleIssue[] } {
  const o = (meta?.offline ?? {}) as { review?: unknown; issues?: unknown };
  const issues = Array.isArray(o.issues)
    ? (o.issues as Record<string, unknown>[]).map((i) => ({ kind: String(i.kind ?? ""), detail: String(i.detail ?? "") }))
    : [];
  return { review: o.review === true || issues.length > 0, issues };
}

/** Replay one stored sale with its ORIGINAL client id (the server is idempotent on it). */
async function postRecord(rec: OutboxRecord): Promise<PostResult> {
  if (rec.kind === "retail.sale") {
    const env = await callZatGoApi<{ invoice?: Record<string, unknown> }>(ZatGoApi.retailPos.saleCreate, rec.payload);
    const invoice = String(env.data?.invoice?.id ?? "");
    if (!invoice) throw Object.assign(new Error("The site did not return an invoice"), { status: 502 });
    return { invoice, ...readOfflineMeta(env.meta) };
  }
  // resto.counter: create the order, then pay it; both steps carry the same client id and replay safely.
  const { create, pay } = rec.payload as { create: Record<string, unknown>; pay: Record<string, unknown> };
  const created = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersCreate, create);
  const orderId = String(created.data?.id ?? "");
  if (!orderId) throw Object.assign(new Error("The site did not return an order"), { status: 502 });
  const paid = await callZatGoApi<{ order?: Record<string, unknown>; payment?: Record<string, unknown> }>(
    ZatGoApi.restoPos.billingPay,
    { ...pay, order_id: orderId },
  );
  const order = paid.data?.order ?? {};
  const payment = paid.data?.payment ?? {};
  const invoice = String(order.number ?? payment.orderNumber ?? payment.order_number ?? orderId);
  return { invoice, ...readOfflineMeta(paid.meta ?? created.meta) };
}

let running = false;

/**
 * Send the queue: FIFO per cashier, one at a time. Stops on a transient failure (backoff), a lost login or a
 * switched-off POS; a permanently rejected sale is parked and the queue moves on.
 */
export async function runSync(opts: { manual?: boolean } = {}): Promise<void> {
  const bridge = offlineBridge();
  if (!bridge || running) return;
  const store = useOutbox.getState();
  if (!store.loaded) await store.refresh();
  if (!useOutbox.getState().records.some((r) => r.state !== "synced")) {
    if (useSyncStatus.getState().status !== "idle") setStatus("idle");
    return;
  }
  running = true;
  let synced = 0;
  let parked = 0;
  // Why nothing was sent, said out loud when the cashier pressed "Sync now" (the timer stays quiet).
  const stop = (status: SyncStatus, message: string | null) => {
    setStatus(status, message);
    if (opts.manual && message) toast.info(message);
  };
  try {
    for (;;) {
      let net = useConnectivity.getState().net;
      if (net === "offline") {
        // The heartbeat can be a few seconds behind: ask for a fresh probe before giving up.
        await useConnectivity.getState().checkNow();
        net = useConnectivity.getState().net;
      }
      if (net === "offline") {
        return stop("offline", "The site cannot be reached yet. Sales stay saved on this device and sync by themselves once it can.");
      }
      const session = useSessionStore.getState();
      const waiting = useOutbox.getState().records.filter((r) => r.state !== "synced");
      if (net === "auth-expired" || !session.connected || !session.user) {
        const who = waiting[0]?.user;
        return stop("paused-auth", who ? `Sign in as ${who} to sync` : "Sign in to sync");
      }
      const site = normalizeSite(session.connection.baseUrl);
      const mine = waiting.filter((r) => r.user.toLowerCase() === session.user!.toLowerCase() && normalizeSite(r.site) === site);
      if (mine.length === 0) {
        return stop("wrong-user", `Waiting sales belong to ${waiting[0]?.user ?? "another cashier"}; they sync when that cashier signs in`);
      }
      if (opts.manual) {
        for (const r of mine) if (r.state === "retry_wait") await useOutbox.getState().put(markRetryNow(r));
      }
      const due = nextDue(useOutbox.getState().records.filter((r) => mine.some((m) => m.id === r.id)), Date.now());
      if (!due) return setStatus("idle", null);

      setStatus("syncing");
      await useOutbox.getState().put(markSending(due));
      const sending = useOutbox.getState().records.find((r) => r.id === due.id)!;
      try {
        const result = await postRecord(sending);
        await useOutbox.getState().put(markSynced(sending, result, Date.now()));
        synced++;
        if (result.review) toast.warning(`Sale ${sending.offlineRef} was posted and flagged for a manager to review.`);
      } catch (err) {
        const info = failureInfo(err);
        const message = err instanceof Error ? err.message : "Sync failed";
        const kind = classifyFailure(info);
        if (kind === "transient") {
          await useOutbox.getState().put(markRetry(sending, message, Date.now()));
          if (info.network) useConnectivity.getState().markNetworkFailure();
          return stop("idle", `Retrying: ${message}`);
        }
        if (kind === "auth") {
          // A 403 from a still-valid login is a permission problem for this sale, not a lost session.
          const probe = info.status === 403 ? await bridge.offlineProbeAuth().catch(() => ({ authenticated: false })) : { authenticated: false };
          if (probe.authenticated) {
            await useOutbox.getState().put(markNeedsAttention(sending, `Not allowed: ${message}`));
            parked++;
            continue;
          }
          await useOutbox.getState().put(markPaused(sending, "Sign in again to sync"));
          return stop("paused-auth", `Sign in as ${sending.user} to sync`);
        }
        if (kind === "switched-off") {
          await useOutbox.getState().put(markPaused(sending, message));
          return stop("paused-off", "The POS is switched off on the site — sales stay saved here until it is back on");
        }
        await useOutbox.getState().put(markNeedsAttention(sending, message));
        parked++;
      }
    }
  } finally {
    running = false;
    useSyncStatus.setState({ lastRunAt: Date.now() });
    if (synced) {
      await pruneOutbox();
      void queryClient.invalidateQueries({ queryKey: ["pos"] });
      toast.success(`${synced} offline sale${synced === 1 ? "" : "s"} synced`);
    }
    if (parked) toast.error(`${parked} sale${parked === 1 ? "" : "s"} need attention — open Pending sales`);
  }
}

export function kickSync(opts: { manual?: boolean } = {}): void {
  setTimeout(() => void runSync(opts), 0);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Run on reconnect, after a re-login, and on a 10 s tick (backoff timers are checked there). */
export function startSyncWorker(): void {
  if (timer) return;
  let lastNet = useConnectivity.getState().net;
  useConnectivity.subscribe((s) => {
    if (s.net === "online" && lastNet !== "online") kickSync();
    lastNet = s.net;
  });
  let lastUser = useSessionStore.getState().user;
  let lastConnected = useSessionStore.getState().connected;
  useSessionStore.subscribe((s) => {
    if (s.connected && (!lastConnected || s.user !== lastUser)) kickSync();
    lastUser = s.user;
    lastConnected = s.connected;
  });
  timer = setInterval(() => void runSync(), 10_000);
  kickSync();
}

export function stopSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
