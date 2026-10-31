import test from "node:test";
import assert from "node:assert/strict";
import { fromFull, maxModified, mergeDelta, pullAllPages } from "./snapshot-merge.ts";

const row = (id: string, modified: string, extra: Record<string, unknown> = {}) => ({ id, modified, ...extra });

test("delta upserts changed rows, adds new ones, and tombstones remove disabled items", () => {
  const existing = [row("A", "2026-01-01", { price: 1 }), row("B", "2026-01-01"), row("C", "2026-01-01")];
  const delta = [row("A", "2026-02-01", { price: 2 }), row("B", "2026-02-01", { disabled: 1 }), row("D", "2026-02-01")];
  const out = mergeDelta(existing, delta);
  assert.deepEqual(out.map((r) => r.id).sort(), ["A", "C", "D"]);
  assert.equal(out.find((r) => r.id === "A")?.price, 2);
  assert.equal(existing.length, 3); // input untouched
});

test("a disabled row in a full pull is ignored", () => {
  assert.deepEqual(fromFull([row("A", "1"), row("B", "1", { disabled: true })]).map((r) => r.id), ["A"]);
});

test("maxModified keeps the newest cursor and never moves back", () => {
  assert.equal(maxModified([row("A", "2026-01-02 10:00:00.5"), row("B", "2026-01-03 09:00:00")]), "2026-01-03 09:00:00");
  assert.equal(maxModified([row("A", "2026-01-01")], "2026-05-05"), "2026-05-05");
  assert.equal(maxModified([], null), null);
});

test("pull pages until a short page (beyond the old 3000-row cap)", async () => {
  const total = 3450;
  const seen: number[] = [];
  const rows = await pullAllPages(async (page) => {
    seen.push(page);
    const start = (page - 1) * 100;
    return Array.from({ length: Math.max(0, Math.min(100, total - start)) }, (_, i) => row(`I${start + i}`, "1"));
  });
  assert.equal(rows.length, 3450);
  assert.equal(seen.length, 35);
});

test("an exact multiple of the page size ends on the empty page", async () => {
  const rows = await pullAllPages(async (page) =>
    page <= 2 ? Array.from({ length: 100 }, (_, i) => row(`${page}-${i}`, "1")) : [],
  );
  assert.equal(rows.length, 200);
});

test("a failing page rejects (caller falls back to a full refresh)", async () => {
  await assert.rejects(pullAllPages(async () => { throw new Error("boom"); }));
});
