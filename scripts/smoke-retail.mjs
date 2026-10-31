#!/usr/bin/env node
// Smoke test of the Supermarket (retail) POS API calls, over a real cookie session.
// Usage: POS_SITE=http://localhost:8000 POS_USER=Administrator POS_PASS=... node scripts/smoke-retail.mjs
// Creates test data (items/orders/invoices) on the site: run against a dev/test site only.
const site = (process.env.POS_SITE || "").replace(/\/$/, "");
const usr = process.env.POS_USER;
const pwd = process.env.POS_PASS;
if (!site || !usr || !pwd) {
  console.error("Set POS_SITE, POS_USER and POS_PASS");
  process.exit(2);
}

let cookie = "";
let pass = 0;
let fail = 0;
const rid = () => Math.random().toString(36).slice(2, 10);

async function call(method, args = {}) {
  const res = await fetch(`${site}/api/method/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body._server_messages
      ? JSON.parse(JSON.parse(body._server_messages)[0]).message
      : body.exception || `HTTP ${res.status}`;
    throw new Error(`${res.status} ${msg}`);
  }
  const m = body.message;
  if (m && typeof m === "object" && "success" in m) {
    if (!m.success) throw new Error(String(m.error?.message ?? JSON.stringify(m.error)));
    return m;
  }
  return m;
}

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};
const ok = (v, what) => {
  if (!v) throw new Error(what);
};
const R = "zatgo_core.api.v1.retail_pos.";

const login = await fetch(`${site}/api/method/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ usr, pwd }),
});
if (!login.ok) {
  console.error(`login failed: HTTP ${login.status}`);
  process.exit(1);
}
cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log(`logged in to ${site}`);

const code = `SMOKE-${rid().toUpperCase()}`;
let profile;
let invoiceId;

await check("login: session works (pos_profile readable)", async () => {
  profile = (await call("zatgo_core.api.v1.pos_profile.get")).data;
  ok(profile, "no profile");
});
await check("profile: pos_mode = retail", async () => {
  eq(profile.pos_mode, "retail", "pos_mode");
  ok(profile.retail === true, "retail flag");
});
await check("catalog: list", async () => {
  const rows = (await call(R + "catalog.list", { page: 1, page_size: 5 })).data;
  ok(Array.isArray(rows), "catalog.list not an array");
});
await check("catalog: item upsert + get + barcode", async () => {
  await call(R + "catalog.upsert", { item_code: code, item_name: "Smoke Rice 1kg", price: 10, barcode: `BC-${code}` });
  const got = (await call(R + "catalog.get", { name: code })).data;
  ok(got && (got.id === code || got.item_code === code), "item not readable");
  const found = (await call(R + "catalog.by_barcode", { code: `BC-${code}` })).data;
  ok(found, "barcode not found");
});
await check("stock: adjust +20, idempotent retry, list", async () => {
  const cid = `smoke-adj-${rid()}`;
  const a = await call(R + "stock.adjust", { item_code: code, qty: 20, client_id: cid });
  const b = await call(R + "stock.adjust", { item_code: code, qty: 20, client_id: cid });
  ok(b.meta.idempotent, "retry was not idempotent");
  eq(a.data.onHand, 20, "on hand");
  const rows = (await call(R + "stock.list", { search: code })).data;
  eq(rows.find((r) => r.id === code)?.onHand, 20, "listed on hand");
});
await check("sale.create twice with the same client_id -> one invoice", async () => {
  const cid = `smoke-sale-${rid()}`;
  const args = { items: [{ item_code: code, item_name: "Smoke Rice 1kg", qty: 2, rate: 10 }], method: "cash", client_id: cid };
  const first = await call(R + "sale.create", args);
  const second = await call(R + "sale.create", args);
  invoiceId = first.data.invoice.id;
  ok(invoiceId, "no invoice id");
  eq(second.data.invoice.id, invoiceId, "second call returned a different invoice");
  eq(second.data.payment.id, first.data.payment.id, "second call returned a different payment");
  eq(first.data.payment.amount, first.data.invoice.total, "payment amount = invoice total");
  const rate = (profile.tax_rate || 0) / 100;
  const expected = profile.tax_inclusive ? 20 : Math.round(20 * (1 + rate) * 100) / 100;
  eq(first.data.invoice.total, expected, "invoice total");
});
await check("stock: sale reduced on-hand to 18 (once)", async () => {
  const rows = (await call(R + "stock.list", { search: code })).data;
  eq(rows.find((r) => r.id === code)?.onHand, 18, "on hand after sale");
});
await check("sale.create with a fixed discount, paid by card", async () => {
  const p = await call(R + "sale.create", {
    items: [{ item_code: code, qty: 2, rate: 10 }],
    method: "card",
    client_id: `smoke-disc-${rid()}`,
    discount_type: "fixed",
    discount_value: 5,
  });
  const rate = (profile.tax_rate || 0) / 100;
  const net = 15;
  const expected = profile.tax_inclusive ? net : Math.round(net * (1 + rate) * 100) / 100;
  eq(p.data.invoice.total, expected, "invoice total");
  eq(p.data.payment.method, "card", "method");
});
await check("payments: list contains the sale", async () => {
  const pays = (await call(R + "payments.list", { page: 1, page_size: 200 })).data;
  ok(pays.some((p) => p.orderId === invoiceId || p.orderNumber === invoiceId), "payment missing");
});
await check("dashboard: counts", async () => {
  const d = (await call(R + "dashboard.counts")).data;
  ok(d.paymentsToday >= 2, "paymentsToday");
  ok(d.todaySales >= 20, "todaySales");
  ok(d.itemsSoldToday >= 4, "itemsSoldToday");
  ok("lowStock" in d && "revenueToday" in d, "missing keys");
});
await check("customers: upsert + list", async () => {
  const name = `Smoke Cust ${rid()}`;
  const c = (await call(R + "customers.upsert", { customer_name: name, phone: "0500000001", client_id: `smoke-cust-${rid()}` })).data;
  const list = (await call(R + "customers.list", { search: name })).data;
  ok(list.some((x) => x.id === c.id), "customer missing");
});
await check("catalog: disable item", async () => {
  await call(R + "catalog.disable", { item_code: code });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
