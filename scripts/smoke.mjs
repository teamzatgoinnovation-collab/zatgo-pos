#!/usr/bin/env node
// Smoke test of the API calls ZatGo POS makes, over a real cookie session.
// Usage: POS_SITE=http://localhost:8000 POS_USER=Administrator POS_PASS=... node scripts/smoke.mjs
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
const R = "zatgo_core.api.v1.resto_pos.";

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
let order, table, profile;

await check("profile: restaurant on", async () => {
  profile = (await call("zatgo_core.api.v1.pos_profile.get")).data;
  ok(profile.restaurant, "restaurant industry is off");
  ok(profile.features.includes("tables"), "no tables feature");
});
await check("health/status", async () => {
  const s = await call(R + "health.status");
  ok(s.data.ready, "status not ready");
});
await check("catalog: upsert + list + barcode", async () => {
  await call(R + "catalog.upsert", { item_code: code, item_name: "Smoke Burger", price: 12.5, barcode: `BC-${code}` });
  const got = (await call(R + "catalog.get", { name: code })).data;
  ok(got && (got.id === code || got.item_code === code), "item not readable");
  const found = (await call(R + "catalog.by_barcode", { code: `BC-${code}` })).data;
  ok(found, "barcode not found");
});
await check("stock: adjust +10, idempotent retry, list", async () => {
  const cid = `smoke-adj-${rid()}`;
  const a = await call(R + "stock.adjust", { item_code: code, qty: 10, client_id: cid });
  const b = await call(R + "stock.adjust", { item_code: code, qty: 10, client_id: cid });
  ok(b.meta.idempotent, "retry was not idempotent");
  eq(a.data.onHand, 10, "on hand");
  const rows = (await call(R + "stock.list", { search: code })).data;
  eq(rows.find((r) => r.id === code)?.onHand, 10, "listed on hand");
});
await check("tables: list + seat", async () => {
  const tables = (await call(R + "tables.list", { page: 1, page_size: 100 })).data;
  // A table belongs to a company and its orders use that company's warehouse: set POS_TABLE_PREFIX to
  // the tables of the company whose stock the test adds (default: "Table ", as seeded locally).
  const prefix = process.env.POS_TABLE_PREFIX || "Table ";
  table = tables.find((t) => t.status === "free" && t.name.startsWith(prefix));
  ok(table, "no free table");
  const seated = (await call(R + "tables.seat", { table_id: table.id, covers: 2, client_id: `smoke-seat-${rid()}` })).data;
  order = seated;
  eq(seated.status, "open", "order status");
});
await check("orders: add item, send, KDS advance", async () => {
  const added = (await call(R + "orders.add_item", { order_id: order.id, item_code: code, qty: 2, rate: 12.5 })).data;
  eq(added.items.length, 1, "items");
  const sent = (await call(R + "orders.send", { order_id: order.id })).data;
  eq(sent.status, "sent", "sent status");
  const tickets = (await call(R + "kds_tickets.list", { page: 1, page_size: 100 })).data;
  const mine = tickets.find((t) => t.orderNumber === order.number);
  ok(mine, "no KDS ticket for order");
  await call(R + "kds_tickets.advance", { name: mine.id });
});
await check("billing: mark billing + pay twice -> one invoice", async () => {
  await call(R + "billing.mark_billing", { order_id: order.id });
  const cid = `smoke-pay-${rid()}`;
  const first = await call(R + "billing.pay", { order_id: order.id, method: "cash", client_id: cid });
  const second = await call(R + "billing.pay", { order_id: order.id, method: "cash", client_id: cid });
  eq(first.data.order.status, "paid", "paid");
  ok(second.meta.idempotent, "second pay not idempotent");
  eq(first.data.payment.amount, 25, "amount");
});
await check("stock: sale reduced on-hand to 8", async () => {
  const rows = (await call(R + "stock.list", { search: code })).data;
  eq(rows.find((r) => r.id === code)?.onHand, 8, "on hand after sale");
});
await check("walk-in order + pay", async () => {
  const o = (await call(R + "orders.create", {
    channel: "counter",
    items: [{ item_code: code, qty: 1, rate: 12.5 }],
    client_id: `smoke-walk-${rid()}`,
  })).data;
  const p = await call(R + "billing.pay", { order_id: o.id, method: "card", client_id: `smoke-walkpay-${rid()}` });
  eq(p.data.payment.method, "card", "method");
});
await check("pay with discount: invoice total = (subtotal - discount) with site tax", async () => {
  const o = (await call(R + "orders.create", {
    channel: "counter",
    items: [{ item_code: code, qty: 2, rate: 12.5 }],
    client_id: `smoke-disc-${rid()}`,
  })).data;
  const p = await call(R + "billing.pay", {
    order_id: o.id, method: "cash", client_id: `smoke-discpay-${rid()}`,
    discount_type: "fixed", discount_value: 5,
  });
  const rate = (profile.tax_rate || 0) / 100;
  const net = 20;
  const expected = profile.tax_inclusive ? net : Math.round(net * (1 + rate) * 100) / 100;
  eq(p.data.payment.amount, expected, "invoice total");
});
await check("void an open order", async () => {
  const o = (await call(R + "orders.create", {
    channel: "counter",
    items: [{ item_code: code, qty: 1, rate: 12.5 }],
    client_id: `smoke-void-${rid()}`,
  })).data;
  const v = (await call(R + "orders.void", { order_id: o.id })).data;
  eq(v.status, "void", "void status");
});
await check("payments list + dashboard counts", async () => {
  const pays = (await call(R + "payments.list", { page: 1, page_size: 200 })).data;
  ok(pays.some((p) => p.orderId === order.id), "payment missing");
  const d = (await call(R + "dashboard.counts")).data;
  ok(d.paymentsToday >= 2, "paymentsToday");
  ok(d.todaySales >= 37.5, "todaySales");
});
await check("customers: upsert + list", async () => {
  const name = `Smoke Cust ${rid()}`;
  const c = (await call(R + "customers.upsert", { customer_name: name, phone: "0500000001", client_id: `smoke-cust-${rid()}` })).data;
  const list = (await call(R + "customers.list", { search: name })).data;
  ok(list.some((x) => x.id === c.id), "customer missing");
});
await check("delivery boys list", async () => {
  await call("zatgo_core.api.v1.delivery.boys.list", { page: 1, page_size: 100 });
});
await check("catalog: disable item", async () => {
  await call(R + "catalog.disable", { item_code: code });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
