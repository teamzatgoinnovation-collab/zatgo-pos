import test from "node:test";
import assert from "node:assert/strict";
import { renderInvoiceHtml } from "./invoice-html.ts";
import type { PosDocument } from "./pos-document.ts";
import { parseCounterSettings } from "./offline/settings.ts";

const money = (n: number) => `SAR ${n.toFixed(2)}`;
const base: PosDocument = {
  kind: "invoice",
  businessName: "ZatGo POS",
  subtitle: "Tax invoice",
  number: "S1-05",
  issuedAt: "2026-10-31T15:49:41",
  lines: [{ name: "Milk 1L", qty: 2, unitPrice: 7.5, total: 15 }],
  subtotal: 15,
  discount: 0,
  tax: 2.25,
  total: 17.25,
  paymentMethod: "cash",
  company: {
    name: "Acme Trading",
    nameAr: "شركة أكمي",
    vatNumber: "300000000000003",
    crNumber: "1010000000",
    phone: "0112345678",
    address: "King Fahd Rd, Riyadh",
  },
  buyer: { name: "Al Noor Store", vatNumber: "310000000000003", crNumber: "2050000000", phone: "0555", address: "Jeddah" },
  qr: { phase: 1, base64: "AQ==" },
};

test("80mm: seller and buyer details, QR and totals on one narrow column", () => {
  const html = renderInvoiceHtml(base, "80mm", { formatMoney: money, qrSvg: "<svg id=qr></svg>" });
  assert.match(html, /size: 80mm auto/);
  for (const text of ["Acme Trading", "300000000000003", "1010000000", "0112345678", "King Fahd Rd", "Al Noor Store", "310000000000003", "2050000000", "<svg id=qr>", "SAR 17.25", "VAT"]) {
    assert.ok(html.includes(text), `missing ${text}`);
  }
  assert.ok(!html.includes('<table class="items">'));
});

test("A4: tax-invoice page with bill-to block, item table and QR", () => {
  const html = renderInvoiceHtml(base, "a4", { formatMoney: money, qrSvg: "<svg id=qr></svg>" });
  assert.match(html, /size: A4/);
  assert.ok(html.includes('<table class="items">'));
  assert.ok(html.includes("Bill to"));
  assert.ok(html.includes("Al Noor Store"));
  assert.ok(html.includes("VAT No."));
  assert.ok(html.includes("CR No."));
  assert.ok(html.includes("<svg id=qr>"));
  assert.ok(html.includes("SAR 7.50") && html.includes("SAR 15.00"));
});

test("blank details are left out, a missing buyer is a walk-in, no QR means no QR block", () => {
  const doc: PosDocument = { ...base, company: { name: "Acme" }, buyer: undefined, qr: undefined };
  const a4 = renderInvoiceHtml(doc, "a4", { formatMoney: money });
  assert.ok(a4.includes("Walk-in customer"));
  assert.ok(!a4.includes("VAT No."));
  assert.ok(!a4.includes('class="qr"'));
  const roll = renderInvoiceHtml(doc, "80mm", { formatMoney: money });
  assert.ok(!roll.includes("VAT:"));
});

test("Arabic names get rtl direction, HTML is escaped, tax line can be hidden", () => {
  const html = renderInvoiceHtml({ ...base, showTax: false, lines: [{ name: "<b>x</b>", qty: 1, unitPrice: 1, total: 1 }] }, "80mm", { formatMoney: money });
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(!html.includes("<span>VAT</span>"));
});

test("a provisional offline QR is labelled; the pending banner shows", () => {
  const html = renderInvoiceHtml({ ...base, pendingSyncRef: "OFF-1", qr: { phase: 1, base64: "AQ==", provisional: true } }, "80mm", {
    formatMoney: money,
    qrSvg: "<svg></svg>",
  });
  assert.ok(html.includes("Provisional QR"));
  assert.ok(html.includes("PENDING SYNC"));
});

test("kitchen tickets stay 80mm and show no money or QR", () => {
  const html = renderInvoiceHtml({ ...base, kind: "kitchen" }, "a4", { formatMoney: money, qrSvg: "<svg></svg>" });
  assert.match(html, /size: 80mm auto/);
  assert.ok(!html.includes("SAR"));
});

test("counter settings: defaults and values", () => {
  assert.deepEqual(parseCounterSettings(undefined), { paperSize: "80mm", productView: "grid", allowPriceChange: false, invoiceQr: "phase1" });
  assert.deepEqual(parseCounterSettings({ paper_size: "A4", product_view: "row", allow_price_change: 1, invoice_qr: "off" }), {
    paperSize: "a4",
    productView: "row",
    allowPriceChange: true,
    invoiceQr: "off",
  });
});
