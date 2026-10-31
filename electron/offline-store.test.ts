import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OfflineStore, type Cipher } from "./offline-store.ts";

const fakeCipher: Cipher = {
  available: () => true,
  encrypt: (s) => Buffer.from(`ENC:${Buffer.from(s).toString("base64")}`),
  decrypt: (b) => {
    const t = b.toString();
    if (!t.startsWith("ENC:")) throw new Error("bad");
    return Buffer.from(t.slice(4), "base64").toString();
  },
};
const noCipher: Cipher = { available: () => false, encrypt: () => { throw new Error("n/a"); }, decrypt: () => { throw new Error("n/a"); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zgpos-"));

test("outbox: add is idempotent, survives a new instance, is encrypted on disk", async () => {
  const dir = tmp();
  const a = new OfflineStore(dir, fakeCipher);
  await a.outboxAdd({ id: "c1", total: 5, phone: "0555-secret" });
  await a.outboxAdd({ id: "c1", total: 999 });
  await a.outboxAdd({ id: "c2" });
  const b = new OfflineStore(dir, fakeCipher);
  const rows = await b.outboxList();
  assert.deepEqual(rows.map((r) => r.id), ["c1", "c2"]);
  assert.equal(rows[0].total, 5);
  const raw = fs.readFileSync(path.join(dir, "outbox.enc"), "utf8");
  assert.ok(!raw.includes("0555-secret"));
  assert.ok(!fs.existsSync(path.join(dir, "outbox.json")));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("outbox update and remove", async () => {
  const s = new OfflineStore(tmp(), fakeCipher);
  await s.outboxAdd({ id: "c1", state: "pending" });
  const u = await s.outboxUpdate("c1", { state: "synced", id: "evil" });
  assert.equal(u?.id, "c1");
  assert.equal(u?.state, "synced");
  assert.equal(await s.outboxUpdate("nope", {}), null);
  assert.equal(await s.outboxRemove("c1"), true);
  assert.equal(await s.outboxRemove("c1"), false);
  assert.deepEqual(await s.outboxList(), []);
});

test("without encryption it still works and says so", async () => {
  const dir = tmp();
  const s = new OfflineStore(dir, noCipher);
  await s.outboxAdd({ id: "c1" });
  assert.equal((await s.deviceInfo()).encrypted, false);
  assert.ok(fs.existsSync(path.join(dir, "outbox.json")));
  assert.deepEqual((await new OfflineStore(dir, noCipher).outboxList()).map((r) => r.id), ["c1"]);
});

test("an unreadable outbox is reported and never overwritten", async () => {
  const dir = tmp();
  const a = new OfflineStore(dir, fakeCipher);
  await a.outboxAdd({ id: "c1" });
  const b = new OfflineStore(dir, { ...fakeCipher, decrypt: () => { throw new Error("keychain changed"); } });
  await assert.rejects(b.outboxList());
  await assert.rejects(b.outboxAdd({ id: "c2" }));
  assert.ok((await b.deviceInfo()).storeError);
  assert.equal((await new OfflineStore(dir, fakeCipher).outboxList()).length, 1);
});

test("device id is stable and the receipt sequence only grows across restarts", async () => {
  const dir = tmp();
  const a = new OfflineStore(dir, fakeCipher);
  const id = (await a.deviceInfo()).deviceId;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(await a.nextReceiptSeq(), 1);
  assert.equal(await a.nextReceiptSeq(), 2);
  const b = new OfflineStore(dir, fakeCipher);
  assert.equal((await b.deviceInfo()).deviceId, id);
  assert.equal(await b.nextReceiptSeq(), 3);
  const seqs = await Promise.all([b.nextReceiptSeq(), b.nextReceiptSeq(), b.nextReceiptSeq()]);
  assert.equal(new Set(seqs).size, 3);
});

test("snapshots round-trip; customers are encrypted; bad names are refused", async () => {
  const dir = tmp();
  const s = new OfflineStore(dir, fakeCipher);
  await s.snapshotSet("catalog", { rows: [1] });
  await s.snapshotSet("customers", { rows: [{ phone: "0555-pii" }] });
  const t = new OfflineStore(dir, fakeCipher);
  assert.deepEqual(await t.snapshotGet("catalog"), { rows: [1] });
  assert.deepEqual(await t.snapshotGet("customers"), { rows: [{ phone: "0555-pii" }] });
  assert.equal(await t.snapshotGet("profile"), null);
  assert.ok(!fs.readFileSync(path.join(dir, "customers.enc"), "utf8").includes("0555-pii"));
  assert.ok(fs.existsSync(path.join(dir, "snap_catalog.json")));
  await assert.rejects(s.snapshotGet("../x"));
});

test("PIN: set, verify, wrong, lockout, never stores the PIN", async () => {
  const dir = tmp();
  let now = 1_000_000;
  const s = new OfflineStore(dir, fakeCipher, () => now);
  await assert.rejects(s.pinSet({ scope: "https://s", user: "a@x", fullName: "A", pin: "12" }));
  await s.pinSet({ scope: "https://s", user: "a@x", fullName: "Ann", pin: "4821" });
  assert.deepEqual(await s.pinUsers("https://s"), [{ user: "a@x", fullName: "Ann" }]);
  assert.deepEqual(await s.pinUsers("https://other"), []);
  assert.deepEqual(await s.pinVerify({ scope: "https://s", user: "a@x", pin: "4821" }), { ok: true, user: "a@x", fullName: "Ann" });
  assert.deepEqual(await s.pinVerify({ scope: "https://s", user: "zz", pin: "4821" }), { ok: false, reason: "none" });
  for (let i = 0; i < 4; i++) assert.deepEqual(await s.pinVerify({ scope: "https://s", user: "a@x", pin: "0000" }), { ok: false, reason: "wrong" });
  const locked = await s.pinVerify({ scope: "https://s", user: "a@x", pin: "0000" });
  assert.ok(!locked.ok && locked.reason === "locked");
  const stillLocked = await s.pinVerify({ scope: "https://s", user: "a@x", pin: "4821" });
  assert.ok(!stillLocked.ok && stillLocked.reason === "locked");
  now += 31_000;
  assert.equal((await s.pinVerify({ scope: "https://s", user: "a@x", pin: "4821" })).ok, true);
  const disk = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("");
  assert.ok(!disk.includes("4821"));
  await s.pinClear("https://s", "a@x");
  assert.equal((await s.pinVerify({ scope: "https://s", user: "a@x", pin: "4821" })).ok, false);
});
