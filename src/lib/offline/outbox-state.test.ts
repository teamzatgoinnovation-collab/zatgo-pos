import test from "node:test";
import assert from "node:assert/strict";
import {
  markNeedsAttention,
  markPaused,
  markRetry,
  markRetryNow,
  markSending,
  markSynced,
  newRecord,
  nextDue,
  nextWakeAt,
  pendingCount,
  pruneSynced,
  recoverInterrupted,
} from "./outbox-state.ts";

const mk = (id: string, seq: number) =>
  newRecord({
    id,
    kind: "retail.sale",
    payload: { client_id: id },
    user: "a@x.com",
    company: "Co",
    site: "https://s",
    deviceId: "dev",
    saleTime: "2026-10-31T10:00:00+03:00",
    offlineRef: `OFF-DEV0-261031-${seq}`,
    expectedTotal: 11.5,
    expectedTax: 1.5,
    method: "cash",
    receipt: {},
    seq,
    createdAt: seq,
  });

test("happy path: pending -> sending -> synced keeps the same id and stores server issues", () => {
  let r = mk("c1", 1);
  assert.equal(r.state, "pending");
  r = markSending(r);
  assert.equal(r.state, "sending");
  assert.equal(r.attempts, 1);
  r = markSynced(r, { invoice: "SINV-1", review: true, issues: [{ kind: "negative_stock", detail: "x" }] }, 99);
  assert.equal(r.state, "synced");
  assert.equal(r.id, "c1");
  assert.equal(r.invoice, "SINV-1");
  assert.equal(r.review, true);
  assert.equal(r.issues.length, 1);
});

test("transient failure waits with backoff and is retried with the same id", () => {
  let r = markSending(mk("c1", 1));
  r = markRetry(r, "network", 1000, () => 0.5);
  assert.equal(r.state, "retry_wait");
  assert.equal(r.nextAttemptAt, 1000 + 5000);
  assert.equal(nextDue([r], 3000), null);
  assert.equal(nextDue([r], 6000)?.id, "c1");
  assert.equal(nextWakeAt([r]), 6000);
});

test("permanent failure parks the sale, is skipped by the queue, and counts as unsynced", () => {
  const a = markNeedsAttention(markSending(mk("a", 1)), "Unknown item");
  const b = mk("b", 2);
  assert.equal(nextDue([a, b], 0)?.id, "b");
  assert.equal(pendingCount([a, b]), 2);
  assert.equal(markRetryNow(a).state, "pending");
});

test("FIFO: a head waiting for backoff blocks later sales; order is by sequence", () => {
  const head = markRetry(markSending(mk("a", 1)), "e", 0, () => 0.5);
  const next = mk("b", 2);
  assert.equal(nextDue([next, head], 10), null);
  assert.equal(nextDue([next, head], 10_000)?.id, "a");
  assert.equal(nextDue([mk("b", 2), mk("a", 1)], 0)?.id, "a");
});

test("nothing is due while one is sending", () => {
  assert.equal(nextDue([markSending(mk("a", 1)), mk("b", 2)], 0), null);
});

test("paused (login needed) does not burn an attempt", () => {
  const r = markPaused(markSending(mk("a", 1)), "login needed");
  assert.equal(r.state, "pending");
  assert.equal(r.attempts, 0);
  assert.equal(r.lastError, "login needed");
});

test("restart recovers a record stuck in sending", () => {
  const out = recoverInterrupted([markSending(mk("a", 1)), mk("b", 2)]);
  assert.deepEqual(out.map((r) => r.state), ["pending", "pending"]);
});

test("prune keeps all unsynced and the newest N synced", () => {
  const recs = [1, 2, 3, 4].map((i) => markSynced(mk(`s${i}`, i), { invoice: `I${i}` }, i));
  const pending = mk("p", 9);
  const kept = pruneSynced([...recs, pending], 2);
  assert.deepEqual(kept.map((r) => r.id).sort(), ["p", "s3", "s4"]);
});
