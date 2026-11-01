import test from "node:test";
import assert from "node:assert/strict";
import { Heartbeat, type ConnectivityState } from "./heartbeat.ts";

function make(opts: { net?: boolean; ok?: boolean; throws?: boolean; base?: string | null } = {}) {
  const env = { net: opts.net ?? true, ok: opts.ok ?? true, throws: opts.throws ?? false, base: opts.base === undefined ? "https://s" : opts.base };
  const events: ConnectivityState[] = [];
  const urls: string[] = [];
  const hb = new Heartbeat({
    getBaseUrl: () => env.base,
    isNetOnline: () => env.net,
    fetchFn: async (url) => {
      urls.push(url);
      if (env.throws) throw new Error("ECONNREFUSED");
      return { ok: env.ok, status: env.ok ? 200 : 502 };
    },
    emit: (s) => events.push(s),
  });
  return { env, events, urls, hb };
}

test("ping success -> online; emits only on change", async () => {
  const { hb, events, urls } = make();
  assert.equal(await hb.check(), "online");
  await hb.check();
  assert.deepEqual(events, ["online"]);
  assert.equal(urls[0], "https://s/api/method/ping");
});

test("no network, ping failure and bad status -> offline", async () => {
  const a = make({ net: false });
  assert.equal(await a.hb.check(), "offline");
  assert.equal(a.urls.length, 0);
  assert.equal(await make({ throws: true }).hb.check(), "offline");
  assert.equal(await make({ ok: false }).hb.check(), "offline");
  assert.equal(await make({ base: null }).hb.check(), "offline");
});

test("auth-expired only while reachable; offline wins; cleared on re-login", async () => {
  const { hb, env, events } = make();
  await hb.check();
  hb.setAuthExpired(true);
  assert.equal(hb.state(), "auth-expired");
  env.throws = true;
  assert.equal(await hb.check(), "offline");
  env.throws = false;
  assert.equal(await hb.check(), "auth-expired");
  hb.setAuthExpired(false);
  assert.equal(hb.state(), "online");
  assert.deepEqual(events, ["online", "auth-expired", "offline", "auth-expired", "online"]);
});

test("a transport failure on an authenticated call flips to offline immediately", async () => {
  const { hb, events, env } = make();
  await hb.check();
  env.throws = true;
  hb.reportNetworkFailure();
  assert.equal(hb.state(), "offline");
  assert.equal(events.at(-1), "offline");
});

test("a probe that needs no network call (no site yet) does not wedge the probes after it", async () => {
  const { hb, env, urls, events } = make({ base: null });
  assert.equal(await hb.check(), "offline");
  env.base = "https://s";
  assert.equal(await hb.check(), "online");
  assert.equal(urls.length, 1);
  assert.deepEqual(events, ["offline", "online"]);
});

test("recovers by itself once the OS reports the network back", async () => {
  const { hb, env } = make({ net: false });
  assert.equal(await hb.check(), "offline");
  env.net = true;
  assert.equal(await hb.check(), "online");
  env.net = false;
  assert.equal(await hb.check(), "offline");
  env.net = true;
  assert.equal(await hb.check(), "online");
});

test("probes started together share one request; the next one after they finish probes again", async () => {
  const { hb, urls } = make();
  const [a, b] = await Promise.all([hb.check(), hb.check()]);
  assert.equal(a, "online");
  assert.equal(b, "online");
  assert.equal(urls.length, 1);
  await hb.check();
  assert.equal(urls.length, 2);
});

test("an emit that throws (window gone) neither wedges nor loses the change: the next probe announces it", async () => {
  let boom = true;
  const events: ConnectivityState[] = [];
  const hb = new Heartbeat({
    getBaseUrl: () => "https://s",
    isNetOnline: () => true,
    fetchFn: async () => ({ ok: true, status: 200 }),
    emit: (s) => {
      if (boom) throw new Error("Object has been destroyed");
      events.push(s);
    },
  });
  assert.equal(await hb.check(), "online");
  assert.deepEqual(events, []);
  boom = false;
  assert.equal(await hb.check(), "online");
  assert.deepEqual(events, ["online"]);
});
