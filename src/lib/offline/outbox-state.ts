import { backoffMs } from "./classify.ts";
import type { OutboxRecord, SaleIssue } from "./types.ts";

export type NewRecordInput = Omit<
  OutboxRecord,
  "state" | "attempts" | "nextAttemptAt" | "lastError" | "invoice" | "review" | "issues" | "syncedAt"
>;

export function newRecord(input: NewRecordInput): OutboxRecord {
  return {
    ...input,
    state: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    invoice: null,
    review: false,
    issues: [],
    syncedAt: null,
  };
}

export function markSending(rec: OutboxRecord): OutboxRecord {
  return { ...rec, state: "sending", attempts: rec.attempts + 1 };
}

export function markSynced(
  rec: OutboxRecord,
  result: { invoice: string; review?: boolean; issues?: SaleIssue[] },
  now: number,
): OutboxRecord {
  return {
    ...rec,
    state: "synced",
    lastError: null,
    invoice: result.invoice,
    review: Boolean(result.review),
    issues: result.issues ?? [],
    syncedAt: now,
  };
}

/** Transient failure: wait with backoff, then the same record is replayed. */
export function markRetry(rec: OutboxRecord, error: string, now: number, rand?: () => number): OutboxRecord {
  return { ...rec, state: "retry_wait", lastError: error, nextAttemptAt: now + backoffMs(rec.attempts, rand) };
}

/** Permanent failure: parked for a person; never auto-retried. */
export function markNeedsAttention(rec: OutboxRecord, error: string): OutboxRecord {
  return { ...rec, state: "needs_attention", lastError: error };
}

/** Queue-wide pause (login needed / POS off): the sale goes back to pending without burning a retry. */
export function markPaused(rec: OutboxRecord, error: string): OutboxRecord {
  return {
    ...rec,
    state: "pending",
    attempts: Math.max(0, rec.attempts - 1),
    lastError: error,
    nextAttemptAt: 0,
  };
}

/** Manual retry (or the app restarted mid-send): due immediately. */
export function markRetryNow(rec: OutboxRecord): OutboxRecord {
  return { ...rec, state: "pending", nextAttemptAt: 0 };
}

/** After a restart a `sending` record may or may not have reached the server: replay it (same client id = safe). */
export function recoverInterrupted(records: OutboxRecord[]): OutboxRecord[] {
  return records.map((r) => (r.state === "sending" ? { ...r, state: "pending" as const, nextAttemptAt: 0 } : r));
}

export function isUnsynced(rec: OutboxRecord): boolean {
  return rec.state !== "synced";
}

export function pendingCount(records: OutboxRecord[]): number {
  return records.filter(isUnsynced).length;
}

export function byQueueOrder(a: OutboxRecord, b: OutboxRecord): number {
  return a.seq - b.seq || a.createdAt - b.createdAt;
}

/**
 * Next record to send: strict FIFO. Records needing attention are parked and skipped; a head record waiting
 * for its backoff blocks the ones behind it (they would fail for the same reason, and order is kept).
 */
export function nextDue(records: OutboxRecord[], now: number): OutboxRecord | null {
  const queue = records.filter((r) => r.state === "pending" || r.state === "retry_wait" || r.state === "sending").sort(byQueueOrder);
  const head = queue[0];
  if (!head) return null;
  if (head.state === "sending") return null;
  if (head.nextAttemptAt > now) return null;
  return head;
}

/** Earliest time the worker should wake for the head of the queue (null = nothing waiting). */
export function nextWakeAt(records: OutboxRecord[]): number | null {
  const head = records
    .filter((r) => r.state === "pending" || r.state === "retry_wait")
    .sort(byQueueOrder)[0];
  return head ? head.nextAttemptAt : null;
}

/** Keep the newest `keep` synced records (for reprint / the invoices list); everything unsynced is always kept. */
export function pruneSynced(records: OutboxRecord[], keep = 100): OutboxRecord[] {
  const synced = records.filter((r) => r.state === "synced").sort((a, b) => (b.syncedAt ?? 0) - (a.syncedAt ?? 0));
  const drop = new Set(synced.slice(keep).map((r) => r.id));
  return records.filter((r) => !drop.has(r.id));
}
