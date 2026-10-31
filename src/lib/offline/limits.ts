import type { OfflineSettings, OutboxRecord } from "./types.ts";

export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  enabled: false,
  maxOfflineHours: 72,
  maxPendingSales: 500,
  snapshotRefreshMinutes: 15,
  allowCardOffline: false,
};

/** Read the `offline` block of `pos_settings.get`. A server without it cannot take offline sales: disabled. */
export function parseOfflineSettings(raw: unknown): OfflineSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OFFLINE_SETTINGS };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const flag = (v: unknown) => v === true || v === 1 || v === "1";
  return {
    enabled: flag(o.enabled),
    maxOfflineHours: num(o.max_offline_hours, DEFAULT_OFFLINE_SETTINGS.maxOfflineHours),
    maxPendingSales: num(o.max_pending_sales, DEFAULT_OFFLINE_SETTINGS.maxPendingSales),
    snapshotRefreshMinutes: num(o.snapshot_refresh_minutes, DEFAULT_OFFLINE_SETTINGS.snapshotRefreshMinutes),
    allowCardOffline: flag(o.allow_card_offline),
  };
}

export type LimitCode =
  | "disabled"
  | "no-snapshot"
  | "snapshot-too-old"
  | "too-many-pending"
  | "oldest-too-old"
  | "payment-not-allowed";

export type LimitResult = { ok: true; warnings: string[] } | { ok: false; code: LimitCode; message: string };

const HOUR = 3_600_000;

export function oldestUnsyncedTime(records: OutboxRecord[]): number | null {
  let oldest: number | null = null;
  for (const r of records) {
    if (r.state === "synced") continue;
    const t = Date.parse(r.saleTime);
    if (Number.isFinite(t) && (oldest === null || t < oldest)) oldest = t;
  }
  return oldest;
}

/** Whether one more sale may be taken offline right now. Pure: `now` and all inputs are explicit. */
export function checkOfflineSale(input: {
  settings: OfflineSettings;
  now: number;
  records: OutboxRecord[];
  snapshotFetchedAt: number | null;
  method: string;
}): LimitResult {
  const { settings, now, records, snapshotFetchedAt, method } = input;
  if (!settings.enabled) {
    return {
      ok: false,
      code: "disabled",
      message: "Offline selling is not enabled on this site. Reconnect to take sales.",
    };
  }
  if (snapshotFetchedAt === null) {
    return { ok: false, code: "no-snapshot", message: "No product data is saved on this device yet. Reconnect once to load it." };
  }
  const limitMs = settings.maxOfflineHours * HOUR;
  if (now - snapshotFetchedAt > limitMs) {
    return {
      ok: false,
      code: "snapshot-too-old",
      message: `Saved product data is older than ${settings.maxOfflineHours} h. Reconnect to refresh it before selling.`,
    };
  }
  const unsynced = records.filter((r) => r.state !== "synced").length;
  if (unsynced >= settings.maxPendingSales) {
    return {
      ok: false,
      code: "too-many-pending",
      message: `${unsynced} sales are waiting to sync (limit ${settings.maxPendingSales}). Reconnect to sync before selling more.`,
    };
  }
  const oldest = oldestUnsyncedTime(records);
  if (oldest !== null && now - oldest >= limitMs) {
    return {
      ok: false,
      code: "oldest-too-old",
      message: `The oldest unsynced sale is over ${settings.maxOfflineHours} h old and the site would refuse it. Reconnect to sync.`,
    };
  }
  if ((method === "card" || method === "wallet") && !settings.allowCardOffline) {
    return {
      ok: false,
      code: "payment-not-allowed",
      message: "Card and wallet payments need a connection. Take cash, or reconnect.",
    };
  }
  const warnings: string[] = [];
  if (oldest !== null && limitMs - (now - oldest) < limitMs * 0.1) {
    warnings.push("The oldest unsynced sale is close to the offline time limit.");
  }
  if (unsynced >= settings.maxPendingSales * 0.9) {
    warnings.push(`${unsynced} of ${settings.maxPendingSales} offline sales used.`);
  }
  return { ok: true, warnings };
}

/** Hours left before a stored sale passes the limit and the server refuses it (<=0 = already over). */
export function hoursLeft(rec: OutboxRecord, settings: OfflineSettings, now: number): number {
  const t = Date.parse(rec.saleTime);
  if (!Number.isFinite(t)) return settings.maxOfflineHours;
  return settings.maxOfflineHours - (now - t) / HOUR;
}

/** True when the snapshot is due for a refresh. */
export function snapshotDue(fetchedAt: number | null, settings: OfflineSettings, now: number): boolean {
  return fetchedAt === null || now - fetchedAt >= settings.snapshotRefreshMinutes * 60_000;
}

export function ageLabel(ts: number | null, now: number): string {
  if (ts === null) return "never";
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** Cashier-side discount policy from `pos_settings` (the server enforces it too). Returns a message, or null when fine. */
export function discountViolation(
  policy: { allowDiscounts: boolean; maxDiscountPercent: number },
  subtotal: number,
  discount: number,
): string | null {
  if (discount <= 0) return null;
  if (!policy.allowDiscounts) return "Discounts are switched off for this POS.";
  if (policy.maxDiscountPercent > 0 && subtotal > 0) {
    const pct = (discount / subtotal) * 100;
    if (pct > policy.maxDiscountPercent + 1e-9) {
      return `Discount is limited to ${policy.maxDiscountPercent}% of the subtotal.`;
    }
  }
  return null;
}
