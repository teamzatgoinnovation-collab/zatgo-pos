/**
 * The printable invoice, as one HTML string for both paper sizes (preview and printer use the same markup).
 * 80mm: roll receipt, one narrow column. A4: tax invoice page with seller / buyer blocks, item table, totals and the QR.
 * Pure: no store or alias imports, so `node --test` can run it.
 */
import type { PosDocument } from "./pos-document.ts";

export type Paper = "80mm" | "a4";

export type RenderOptions = {
  formatMoney: (n: number) => string;
  /** SVG markup of the ZATCA QR (the caller draws it; empty when there is none). */
  qrSvg?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const isArabic = (text: string) => /[؀-ۿ]/.test(text);
const dir = (text: string) => (isArabic(text) ? ' dir="rtl"' : "");

function partyLines(p: NonNullable<PosDocument["company"]>, labels: { vat: string; cr: string }): string[] {
  const out: string[] = [];
  if (p.nameAr) out.push(`<div${dir(p.nameAr)} class="name-ar">${escapeHtml(p.nameAr)}</div>`);
  if (p.address) out.push(`<div${dir(p.address)}>${escapeHtml(p.address)}</div>`);
  const contact = [p.phone, p.email, p.website].filter((v) => v && v.trim()).join(" · ");
  if (contact) out.push(`<div>${escapeHtml(contact)}</div>`);
  if (p.vatNumber) out.push(`<div>${labels.vat}: <strong>${escapeHtml(p.vatNumber)}</strong></div>`);
  if (p.crNumber) out.push(`<div>${labels.cr}: <strong>${escapeHtml(p.crNumber)}</strong></div>`);
  return out;
}

export function renderInvoiceHtml(doc: PosDocument, paper: Paper, opts: RenderOptions): string {
  const m = opts.formatMoney;
  const kitchen = doc.kind === "kitchen";
  const a4 = paper === "a4" && !kitchen;
  const seller = doc.company;
  const buyer = doc.buyer;
  const qr = opts.qrSvg ? `<div class="qr">${opts.qrSvg}${doc.qr?.provisional ? `<div class="muted">Provisional QR</div>` : ""}</div>` : "";

  const lineRows = doc.lines
    .map((line, i) => {
      if (kitchen) {
        return `<tr><td><div><strong>${line.qty}×</strong> ${escapeHtml(line.name)}</div>${line.extras ? `<div class="muted">+ ${escapeHtml(line.extras)}</div>` : ""}</td><td class="right muted">${escapeHtml(line.meta ?? "")}</td></tr>`;
      }
      if (a4) {
        return `<tr><td class="num">${i + 1}</td><td><div${dir(line.name)}>${escapeHtml(line.name)}</div>${line.extras ? `<div class="muted">+ ${escapeHtml(line.extras)}</div>` : ""}</td><td class="right">${line.qty}</td><td class="right">${m(line.unitPrice)}</td><td class="right">${m(line.total)}</td></tr>`;
      }
      return `<tr><td><div${dir(line.name)}>${escapeHtml(line.name)}</div>${line.extras ? `<div class="muted">+ ${escapeHtml(line.extras)}</div>` : ""}<div class="muted">${line.qty} × ${m(line.unitPrice)}</div></td><td class="right">${m(line.total)}</td></tr>`;
    })
    .join("");

  const totals = kitchen
    ? ""
    : `<div class="totals">
        <div><span>Subtotal</span><span>${m(doc.subtotal)}</span></div>
        ${doc.discount > 0 ? `<div><span>Discount</span><span>−${m(doc.discount)}</span></div>` : ""}
        ${doc.showTax === false ? "" : `<div><span>VAT</span><span>${m(doc.tax)}</span></div>`}
        <div class="grand"><span>Total</span><span>${m(doc.total)}</span></div>
        ${doc.paymentMethod ? `<div><span>Paid</span><span class="cap">${escapeHtml(doc.paymentMethod)}</span></div>` : ""}
        ${doc.cashTendered !== undefined ? `<div><span>Tendered</span><span>${m(doc.cashTendered)}</span></div>` : ""}
        ${doc.changeDue !== undefined ? `<div><span>Change</span><span>${m(doc.changeDue)}</span></div>` : ""}
      </div>`;

  const pending = doc.pendingSyncRef
    ? `<p class="pending">PENDING SYNC<br />Offline receipt ${escapeHtml(doc.pendingSyncRef)}<br /><span style="font-weight:400">Provisional — the final invoice is issued when this sale syncs</span></p>`
    : "";
  const extraMeta = [
    doc.tableName
      ? `<p class="meta">${escapeHtml(doc.tableName)}${doc.server ? ` · ${escapeHtml(doc.server)}` : ""}${doc.channel ? ` · ${escapeHtml(doc.channel.replaceAll("_", " "))}` : ""}</p>`
      : "",
    doc.deliveryAddress
      ? `<p class="meta">Deliver to: ${escapeHtml(doc.deliveryAddress)}${doc.deliveryPhone ? ` · ${escapeHtml(doc.deliveryPhone)}` : ""}</p>`
      : "",
    doc.deliveryBoyName ? `<p class="meta">Courier: ${escapeHtml(doc.deliveryBoyName)}</p>` : "",
  ].join("");

  const styles = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: ${a4 ? "0" : "8px"}; font-family: ${a4 ? "system-ui, 'Segoe UI', Arial, sans-serif" : "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"}; font-size: ${a4 ? "13px" : "12px"}; color: #111; background: #fff; }
    .sheet { width: ${a4 ? "190mm" : "72mm"}; max-width: 100%; margin: 0 auto; }
    h1 { font-size: ${a4 ? "22px" : "15px"}; margin: 0 0 2px; ${a4 ? "" : "text-align: center;"} }
    .sub { color: #555; margin: 0 0 4px; ${a4 ? "" : "text-align: center;"} }
    .meta { text-align: center; color: #555; margin: 0 0 3px; }
    .rule { border: none; border-top: 1px dashed #999; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { vertical-align: top; padding: ${a4 ? "6px 8px" : "3px 0"}; }
    .right { text-align: right; white-space: nowrap; }
    .num { width: 28px; color: #666; }
    .muted { color: #666; font-size: 0.9em; }
    .cap { text-transform: capitalize; }
    .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
    .grand { font-weight: 700; font-size: 1.1em; margin-top: 4px; border-top: 1px solid #111; padding-top: 4px !important; }
    .pending { border: 2px solid #111; text-align: center; font-weight: 700; padding: 4px; margin: 6px 0; }
    .footer { text-align: center; color: #555; margin-top: 12px; font-size: 0.9em; }
    .party div { padding: 1px 0; }
    .party { ${a4 ? "" : "text-align: center;"} }
    .name-ar { font-weight: 600; }
    .qr { text-align: center; }
    .qr svg { width: ${a4 ? "34mm" : "40mm"}; height: ${a4 ? "34mm" : "40mm"}; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 10px; }
    .cols { display: flex; gap: 16px; margin: 12px 0; }
    .box { flex: 1; border: 1px solid #bbb; border-radius: 4px; padding: 8px 10px; }
    .box h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
    .items thead th { background: #f0f0f0; text-align: left; border-bottom: 1px solid #999; font-size: 11px; text-transform: uppercase; }
    .items thead th.right { text-align: right; }
    .items td { border-bottom: 1px solid #e3e3e3; }
    .summary { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 12px; }
    .summary .totals { min-width: 70mm; }
    @page { size: ${a4 ? "A4" : "80mm auto"}; margin: ${a4 ? "10mm" : "0"}; }
    @media print { body { padding: 0; } }`;

  const titleLine = `${escapeHtml(doc.subtitle ?? doc.kind)}${doc.kind === "invoice" || doc.kind === "receipt" ? "" : ""}`;
  const headerNote = doc.headerNote ? `<p class="sub">${escapeHtml(doc.headerNote)}</p>` : "";
  const footer = doc.footerNote ? `<p class="footer">${escapeHtml(doc.footerNote)}</p>` : "";

  let body: string;
  if (a4) {
    body = `
    <div class="head">
      <div class="party">
        <h1${dir(seller?.name ?? doc.businessName)}>${escapeHtml(seller?.name ?? doc.businessName)}</h1>
        ${seller ? partyLines(seller, { vat: "VAT No.", cr: "CR No." }).join("") : ""}
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700">${escapeHtml(doc.subtitle ?? "Tax invoice")}</div>
        <div>No. <strong>${escapeHtml(doc.number)}</strong></div>
        <div>${escapeHtml(formatWhen(doc.issuedAt))}</div>
        ${qr}
      </div>
    </div>
    ${pending}${headerNote}
    <div class="cols">
      <div class="box party"><h3>Bill to</h3>
        ${buyer ? `<div><strong${dir(buyer.name)}>${escapeHtml(buyer.name)}</strong></div>${partyLines({ ...buyer, nameAr: buyer.nameAr }, { vat: "VAT No.", cr: "CR No." }).join("")}` : `<div>Walk-in customer</div>`}
      </div>
      <div class="box"><h3>Invoice</h3>
        <div>Paid by: <span class="cap">${escapeHtml(doc.paymentMethod ?? "—")}</span></div>
        ${extraMeta.replaceAll('class="meta"', 'style="margin:0"')}
      </div>
    </div>
    <table class="items">
      <thead><tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Total</th></tr></thead>
      <tbody>${lineRows || `<tr><td colspan="5" class="muted">No lines</td></tr>`}</tbody>
    </table>
    <div class="summary"><div></div>${totals}</div>
    ${footer}`;
  } else {
    body = `
    <h1${dir(seller?.name ?? doc.businessName)}>${escapeHtml(seller?.name ?? doc.businessName)}</h1>
    ${seller ? `<div class="party">${partyLines(seller, { vat: "VAT", cr: "CR" }).join("")}</div>` : ""}
    <p class="sub">${titleLine}</p>${headerNote}
    ${pending}
    <p class="meta">#${escapeHtml(doc.number)} · ${escapeHtml(formatWhen(doc.issuedAt))}</p>
    ${extraMeta}
    ${buyer ? `<hr class="rule" /><div class="party"><div><strong${dir(buyer.name)}>${escapeHtml(buyer.name)}</strong></div>${partyLines(buyer, { vat: "VAT", cr: "CR" }).join("")}</div>` : ""}
    <hr class="rule" />
    <table>${lineRows || `<tr><td class="muted">No lines</td></tr>`}</table>
    <hr class="rule" />
    ${totals}
    ${kitchen ? "" : qr}
    ${footer}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${titleLine} #${escapeHtml(doc.number)}</title>
  <style>${styles}</style>
</head>
<body><div class="sheet">${body}</div></body>
</html>`;
}
