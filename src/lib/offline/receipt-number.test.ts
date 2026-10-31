import test from "node:test";
import assert from "node:assert/strict";
import { deviceShortId, formatOfflineRef, isoWithOffset } from "./receipt-number.ts";

test("offline receipt number format and length", () => {
  const ref = formatOfflineRef("a1b2c3d4-0000-4000-8000-000000000000", new Date(2026, 9, 31, 14, 5), 7);
  assert.equal(ref, "OFF-A1B2-261031-0007");
  assert.ok(ref.length <= 40);
  assert.equal(formatOfflineRef("a1b2c3d4", new Date(2027, 0, 2), 12345), "OFF-A1B2-270102-12345");
  assert.equal(deviceShortId("x"), "X000");
});

test("sequence yields distinct, ordered numbers", () => {
  const d = new Date(2026, 9, 31);
  const refs = [1, 2, 3].map((n) => formatOfflineRef("dev12345", d, n));
  assert.equal(new Set(refs).size, 3);
  assert.deepEqual([...refs].sort(), refs);
});

test("isoWithOffset parses back to the same instant and carries an offset", () => {
  const d = new Date(2026, 9, 31, 14, 5, 9);
  const s = isoWithOffset(d);
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(s), d.getTime());
});
