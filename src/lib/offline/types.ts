/** Shared shapes of the offline layer. Type-only module: safe to import from node tests. */

export type OutboxKind = "retail.sale" | "resto.counter";

export type OutboxState = "pending" | "sending" | "retry_wait" | "synced" | "needs_attention";

export type SaleIssue = { kind: string; detail: string };

export type OutboxRecord = {
  /** The sale's `client_id` (idempotency key, replayed unchanged). */
  id: string;
  kind: OutboxKind;
  /** Full arguments of the server call(s); for `resto.counter` { create, pay }. */
  payload: Record<string, unknown>;
  /** ERPNext user who made the sale; only this user may sync it. */
  user: string;
  company: string | null;
  site: string;
  deviceId: string;
  /** ISO 8601 with offset: the device clock when the sale was paid. */
  saleTime: string;
  offlineRef: string;
  /** Device-local figures printed on the receipt (provisional). */
  expectedTotal: number;
  expectedTax: number;
  method: string;
  /** Snapshot of what the receipt shows, so it can be reprinted without the server. */
  receipt: Record<string, unknown>;
  seq: number;
  createdAt: number;
  state: OutboxState;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  invoice: string | null;
  review: boolean;
  issues: SaleIssue[];
  syncedAt: number | null;
};

export type OfflineSettings = {
  enabled: boolean;
  maxOfflineHours: number;
  maxPendingSales: number;
  snapshotRefreshMinutes: number;
  allowCardOffline: boolean;
};

export type ConnectivityState = "online" | "offline" | "auth-expired";

export type ErrorClass = "transient" | "auth" | "switched-off" | "permanent";
