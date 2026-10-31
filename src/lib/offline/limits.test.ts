import test from "node:test";
import assert from "node:assert/strict";
import { ageLabel, checkOfflineSale, discountViolation, hoursLeft, parseOfflineSettings, snapshotDue } from "./limits.ts";
import { markSynced, newRecord } from "./outbox-state.ts";

const H = 3_600_000;
const settings = parseOfflineSettings({
  enabled: 1,
  max_offline_hours: 72,
  max_pending_sales: 3,
  snapshot_refresh_minutes: 15,
  allow_card_offline: 0,
});
const now = Date.parse("2026-10-31T12:00:00Z");
const rec = (id: string, ageH: number, synced = false) => {
  const r = newRecord({
    id, kind: "retail.sale", payload: {}, user: "u", company: null, site: "s", deviceId: "d",
    saleTime: new Date(now - ageH * H).toISOString(), offlineRef: id, expectedTotal: 1, expectedTax: 0,
    method: "cash", receipt: {}, seq: 1, createdAt: 1,
  });
  return synced ? markSynced(r, { invoice: "X" }, 1) : r;
};
const base = { settings, now, records: [], snapshotFetchedAt: now - H, method: "cash" };

test("settings: a server without the block cannot take offline sales", () => {
  assert.equal(parseOfflineSettings(undefined).enabled, false);
  assert.equal(parseOfflineSettings({}).enabled, false);
  assert.equal(settings.enabled, true);
  assert.equal(settings.allowCardOffline, false);
});

test("cash sale within limits is allowed", () => {
  assert.equal(checkOfflineSale(base).ok, true);
});

test("disabled, no snapshot, stale snapshot", () => {
  const r1 = checkOfflineSale({ ...base, settings: { ...settings, enabled: false } });
  assert.ok(!r1.ok && r1.code === "disabled");
  const r2 = checkOfflineSale({ ...base, snapshotFetchedAt: null });
  assert.ok(!r2.ok && r2.code === "no-snapshot");
  const r3 = checkOfflineSale({ ...base, snapshotFetchedAt: now - 73 * H });
  assert.ok(!r3.ok && r3.code === "snapshot-too-old");
});

test("too many pending counts unsynced only", () => {
  const full = [rec("a", 1), rec("b", 1), rec("c", 1)];
  const r = checkOfflineSale({ ...base, records: full });
  assert.ok(!r.ok && r.code === "too-many-pending");
  const ok = checkOfflineSale({ ...base, records: [rec("a", 1), rec("b", 1), rec("c", 1, true)] });
  assert.equal(ok.ok, true);
});

test("oldest unsynced sale at the limit blocks more sales", () => {
  const r = checkOfflineSale({ ...base, records: [rec("a", 73)] });
  assert.ok(!r.ok && r.code === "oldest-too-old");
  const warn = checkOfflineSale({ ...base, records: [rec("a", 70)] });
  assert.ok(warn.ok && warn.warnings.length === 1);
});

test("card/wallet blocked offline unless allowed", () => {
  const r = checkOfflineSale({ ...base, method: "card" });
  assert.ok(!r.ok && r.code === "payment-not-allowed");
  assert.equal(checkOfflineSale({ ...base, method: "wallet", settings: { ...settings, allowCardOffline: true } }).ok, true);
});

test("hoursLeft, snapshotDue, ageLabel", () => {
  assert.equal(Math.round(hoursLeft(rec("a", 12), settings, now)), 60);
  assert.equal(snapshotDue(null, settings, now), true);
  assert.equal(snapshotDue(now - 5 * 60_000, settings, now), false);
  assert.equal(snapshotDue(now - 16 * 60_000, settings, now), true);
  assert.equal(ageLabel(now - 5 * 60_000, now), "5 min ago");
  assert.equal(ageLabel(null, now), "never");
});

test("discount policy: off, over the cap, within the cap, no cap", () => {
  assert.equal(discountViolation({ allowDiscounts: true, maxDiscountPercent: 10 }, 100, 0), null);
  assert.equal(discountViolation({ allowDiscounts: false, maxDiscountPercent: 0 }, 100, 5), "Discounts are switched off for this POS.");
  assert.match(discountViolation({ allowDiscounts: true, maxDiscountPercent: 10 }, 100, 10.5) ?? "", /limited to 10%/);
  assert.equal(discountViolation({ allowDiscounts: true, maxDiscountPercent: 10 }, 100, 10), null);
  assert.equal(discountViolation({ allowDiscounts: true, maxDiscountPercent: 0 }, 100, 90), null);
});
