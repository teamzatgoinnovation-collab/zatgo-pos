#!/usr/bin/env node
// Smoke test of the POS Type setting (ZG POS Settings) over a real cookie session: for every selectable type the
// profile the POS reads (pos_profile.get) and the settings it serves (pos_settings.get) must change with it, and the
// engine that type runs on must answer. Pharmacy / Electrical must be refused. The original type is put back at the end.
// Usage: POS_SITE=http://localhost:8000 POS_USER=Administrator POS_PASS=... node scripts/smoke-types.mjs
// Needs a System Manager who can also read Items (Administrator, or a POS user: on a site with the VanSale custom
// permissions a plain Sales User cannot, a known issue -- the retail engine check then answers 403, not 404).
// Side effect: choosing a type switches its industry on and never switches the other one off
// (zatgo-core), so a site that had only one engine on has both on afterwards -- run against a dev/test site only.
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

// POS Type -> [pos_mode, pos_vertical, an endpoint of the engine that must answer]
const RESTO = "zatgo_core.api.v1.resto_pos.tables.list";
const RETAIL = "zatgo_core.api.v1.retail_pos.catalog.list";
const TYPES = [
  ["Restaurant", "restaurant", "restaurant", RESTO],
  ["Cafe", "restaurant", "cafe", RESTO],
  ["Supermarket", "retail", "supermarket", RETAIL],
  ["General Retail", "retail", "general", RETAIL],
];
const SETTINGS = "ZG POS Settings";
const setType = (value) =>
  call("frappe.client.set_value", { doctype: SETTINGS, name: SETTINGS, fieldname: "pos_type", value });
const storedType = () => call("frappe.client.get_single_value", { doctype: SETTINGS, field: "pos_type" });

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

const original = (await storedType()) || "";
const industriesBefore = (await call("zatgo_core.api.v1.pos_profile.get")).data.industries;
console.log(`original POS Type: ${original || "(none chosen)"}; industries on: ${industriesBefore.join(", ") || "none"}`);

for (const [type, mode, vertical, engine] of TYPES) {
  await check(`${type}: profile and settings agree (${mode} / ${vertical})`, async () => {
    await setType(type);
    const profile = (await call("zatgo_core.api.v1.pos_profile.get")).data;
    const settings = (await call("zatgo_core.api.v1.pos_settings.get")).data;
    for (const [where, d] of [["pos_profile", profile], ["pos_settings", settings]]) {
      eq(d.pos_type, type, `${where}.pos_type`);
      eq(d.pos_mode, mode, `${where}.pos_mode`);
      eq(d.pos_vertical, vertical, `${where}.pos_vertical`);
    }
    eq(profile.restaurant === true || profile.retail === true, true, "the matching industry is on");
    ok(profile.industries.includes(mode === "restaurant" ? "restaurant" : "supermarket"), "industry not switched on");
  });
  await check(`${type}: its engine answers (${engine.split(".").slice(-3, -1).join(".")})`, async () => {
    const res = await call(engine, { page: 1, page_size: 1 });
    ok(res && res.success !== false, "engine refused");
  });
}

await check("Pharmacy and Electrical are refused and change nothing", async () => {
  await setType("Cafe");
  for (const coming of ["Pharmacy (coming soon)", "Electrical (coming soon)"]) {
    let refused = false;
    try {
      await setType(coming);
    } catch (e) {
      refused = /not available yet/i.test(e.message);
    }
    ok(refused, `${coming} was not refused`);
  }
  eq(await storedType(), "Cafe", "stored type after the refusals");
});

await check("original POS Type put back", async () => {
  await setType(original);
  eq((await storedType()) || "", original, "stored type");
});

const industriesAfter = (await call("zatgo_core.api.v1.pos_profile.get")).data.industries;
const added = industriesAfter.filter((i) => !industriesBefore.includes(i));
if (added.length) console.log(`note: industries switched on by this run (never switched off): ${added.join(", ")}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
