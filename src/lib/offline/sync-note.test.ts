import test from "node:test";
import assert from "node:assert/strict";
import { syncNote } from "./sync-note.ts";

const base = { net: "online", status: "idle", message: null, waiting: 1 } as const;

test("nothing waiting -> no note", () => {
  assert.equal(syncNote({ ...base, waiting: 0, net: "offline" }), null);
});

test("offline wins and says the sales sync by themselves", () => {
  const n = syncNote({ ...base, net: "offline", status: "syncing" });
  assert.equal(n?.tone, "warn");
  assert.match(n!.text, /sync by themselves/);
});

test("a lost login asks for a sign-in, with the worker's own wording when it has one", () => {
  assert.equal(syncNote({ ...base, net: "auth-expired" })?.text, "Sign in again to sync these sales.");
  assert.equal(syncNote({ ...base, status: "paused-auth", message: "Sign in as Administrator to sync" })?.text, "Sign in as Administrator to sync");
});

test("wrong cashier, switched-off POS, syncing and a retry message", () => {
  assert.match(syncNote({ ...base, status: "wrong-user", message: "Waiting sales belong to a@b" })!.text, /belong to a@b/);
  assert.equal(syncNote({ ...base, status: "paused-off", message: "The POS is switched off" })?.tone, "error");
  assert.equal(syncNote({ ...base, status: "syncing" })?.text, "Syncing…");
  assert.equal(syncNote({ ...base, message: "Retrying: HTTP 502" })?.text, "Retrying: HTTP 502");
  assert.equal(syncNote(base), null);
});
