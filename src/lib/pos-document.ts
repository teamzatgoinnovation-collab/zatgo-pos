import type { OrderRecord, PaymentRecord } from "@/lib/pos-repo";
import { extrasSummary } from "@/lib/extras";
import type { VerticalProfile } from "@/lib/verticals";

export type DocumentKind = "receipt" | "invoice" | "kitchen";

export type PosDocumentLine = {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  meta?: string;
  extras?: string;
};

export type PosDocument = {
  kind: DocumentKind;
  businessName: string;
  subtitle?: string;
  number: string;
  issuedAt: string;
  lines: PosDocumentLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  cashTendered?: number;
  changeDue?: number;
  tableName?: string;
  server?: string;
  channel?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryBoyName?: string;
  footerNote?: string;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function buildSaleDocument(input: {
  kind: "receipt" | "invoice";
  profile: VerticalProfile;
  order: OrderRecord;
  payment?: PaymentRecord;
  pricing?: { subtotal: number; discount: number; tax: number; total: number };
  cashTendered?: number;
}): PosDocument {
  const { order, payment, profile, kind } = input;
  const subtotal =
    input.pricing?.subtotal ??
    order.items.reduce((n, i) => n + i.qty * i.price, 0);
  const discount = input.pricing?.discount ?? 0;
  const tax = input.pricing?.tax ?? 0;
  const total = input.pricing?.total ?? payment?.amount ?? subtotal - discount + tax;
  const cashTendered = input.cashTendered;
  const changeDue =
    cashTendered !== undefined && Number.isFinite(cashTendered)
      ? cashTendered - total
      : undefined;

  return {
    kind,
    businessName: `ZatGo POS · ${profile.shortLabel}`,
    subtitle: kind === "invoice" ? "Tax invoice / guest check" : "Sales receipt",
    number: order.number,
    issuedAt: payment?.paidAt ?? order.openedAt,
    lines: order.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      unitPrice: i.price,
      total: i.qty * i.price,
      meta: kind === "invoice" ? i.status : undefined,
      extras: extrasSummary(i.extras) || undefined,
    })),
    subtotal,
    discount,
    tax,
    total,
    paymentMethod: payment?.method,
    cashTendered,
    changeDue: changeDue !== undefined && changeDue >= 0 ? changeDue : undefined,
    tableName: order.tableName,
    server: order.server,
    channel: order.channel,
    customerName: order.customerName ?? undefined,
    customerPhone: order.customerPhone ?? undefined,
    deliveryAddress: order.delivery?.address,
    deliveryPhone: order.delivery?.phone,
    deliveryBoyName: order.delivery?.deliveryBoyName ?? undefined,
    footerNote:
      kind === "invoice"
        ? order.channel === "delivery"
          ? "Thank you — delivery invoice. Please retain for your records."
          : "Thank you for dining with us. Please retain this invoice."
        : "Thank you for your purchase.",
  };
}

export function buildKitchenDocument(input: {
  profile: VerticalProfile;
  order: OrderRecord;
}): PosDocument {
  const { order, profile } = input;
  return {
    kind: "kitchen",
    businessName: `${profile.shortLabel} · Kitchen`,
    subtitle: "Preparation ticket",
    number: order.number,
    issuedAt: new Date().toISOString(),
    lines: order.items
      .filter((i) => i.status !== "served")
      .map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: 0,
        total: 0,
        meta: `${i.station} · ${i.status}`,
        extras: extrasSummary(i.extras) || undefined,
      })),
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    tableName: order.tableName,
    server: order.server,
    footerNote: "Fire when ready",
  };
}

export function documentToHtml(doc: PosDocument): string {
  const isKitchen = doc.kind === "kitchen";
  const isInvoice = doc.kind === "invoice";
  const width = isInvoice ? "720px" : "280px";
  const font = isInvoice ? "14px" : "12px";

  const linesHtml = doc.lines
    .map((line) => {
      if (isKitchen) {
        return `<tr>
          <td>
            <div><strong>${line.qty}×</strong> ${escapeHtml(line.name)}</div>
            ${line.extras ? `<div class="muted">+ ${escapeHtml(line.extras)}</div>` : ""}
          </td>
          <td class="right muted">${escapeHtml(line.meta ?? "")}</td>
        </tr>`;
      }
      return `<tr>
        <td>
          <div>${escapeHtml(line.name)}</div>
          ${line.extras ? `<div class="muted">+ ${escapeHtml(line.extras)}</div>` : ""}
          <div class="muted">${line.qty} × ${money(line.unitPrice)}</div>
        </td>
        <td class="right">${money(line.total)}</td>
      </tr>`;
    })
    .join("");

  const totals = isKitchen
    ? ""
    : `<div class="totals">
        <div><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>
        ${doc.discount > 0 ? `<div><span>Discount</span><span>−${money(doc.discount)}</span></div>` : ""}
        <div><span>Tax</span><span>${money(doc.tax)}</span></div>
        <div class="grand"><span>Total</span><span>${money(doc.total)}</span></div>
        ${doc.paymentMethod ? `<div><span>Paid</span><span class="cap">${escapeHtml(doc.paymentMethod)}</span></div>` : ""}
        ${doc.cashTendered !== undefined ? `<div><span>Tendered</span><span>${money(doc.cashTendered)}</span></div>` : ""}
        ${doc.changeDue !== undefined ? `<div><span>Change</span><span>${money(doc.changeDue)}</span></div>` : ""}
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.subtitle ?? doc.kind)} #${escapeHtml(doc.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: ${font};
      color: #111;
      background: #fff;
    }
    .sheet { width: ${width}; max-width: 100%; margin: 0 auto; }
    h1 { font-size: ${isInvoice ? "20px" : "15px"}; margin: 0 0 4px; text-align: center; }
    .sub, .meta { text-align: center; color: #555; margin: 0 0 4px; }
    .rule { border: none; border-top: 1px dashed #999; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 4px 0; }
    .right { text-align: right; white-space: nowrap; }
    .muted { color: #666; font-size: 0.9em; }
    .cap { text-transform: capitalize; }
    .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
    .grand { font-weight: 700; font-size: 1.1em; margin-top: 4px; }
    .footer { text-align: center; color: #555; margin-top: 14px; font-size: 0.9em; }
    @media print {
      body { padding: 0; }
      .sheet { width: ${isInvoice ? "100%" : "80mm"}; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(doc.businessName)}</h1>
    ${doc.subtitle ? `<p class="sub">${escapeHtml(doc.subtitle)}</p>` : ""}
    <p class="meta">#${escapeHtml(doc.number)} · ${escapeHtml(formatWhen(doc.issuedAt))}</p>
    ${doc.tableName ? `<p class="meta">${escapeHtml(doc.tableName)}${doc.server ? ` · ${escapeHtml(doc.server)}` : ""}${doc.channel ? ` · ${escapeHtml(doc.channel.replaceAll("_", " "))}` : ""}</p>` : ""}
    ${doc.customerName ? `<p class="meta">Customer: ${escapeHtml(doc.customerName)}${doc.customerPhone ? ` · ${escapeHtml(doc.customerPhone)}` : ""}</p>` : ""}
    ${doc.deliveryAddress ? `<p class="meta">Deliver to: ${escapeHtml(doc.deliveryAddress)}${doc.deliveryPhone ? ` · ${escapeHtml(doc.deliveryPhone)}` : ""}</p>` : ""}
    ${doc.deliveryBoyName ? `<p class="meta">Courier: ${escapeHtml(doc.deliveryBoyName)}</p>` : ""}
    <hr class="rule" />
    <table>${linesHtml || `<tr><td class="muted">No lines</td></tr>`}</table>
    <hr class="rule" />
    ${totals}
    ${doc.footerNote ? `<p class="footer">${escapeHtml(doc.footerNote)}</p>` : ""}
  </div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
