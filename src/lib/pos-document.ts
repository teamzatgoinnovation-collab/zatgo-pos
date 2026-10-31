import type { OrderRecord, PaymentRecord } from "@/lib/pos-repo";
import type { CustomerRecord } from "@/lib/pos-models";
import { extrasSummary } from "@/lib/extras";
import type { VerticalProfile } from "@/lib/verticals";
import { renderInvoiceHtml, type Paper } from "@/lib/invoice-html";
import { money } from "@/lib/money";
import { qrSvgMarkup } from "@/lib/qr-svg";
import { zatcaTimestamp, zatcaTlvBase64 } from "@/lib/zatca-tlv";
import { queryClient } from "@/lib/query-client";
import { usePosSettings } from "@/lib/offline/settings";
import { useSiteStore } from "@/store/site";

export type DocumentKind = "receipt" | "invoice" | "kitchen";

export type PosDocumentLine = {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  meta?: string;
  extras?: string;
};

export type PartyInfo = {
  name: string;
  nameAr?: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
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
  /** Offline receipt number while the site has not posted the sale yet. */
  pendingSyncRef?: string;
  /** Seller and buyer details printed on the invoice (blank values are left out). */
  company?: PartyInfo;
  buyer?: PartyInfo;
  /** ZATCA QR payload (base64 TLV): Phase 1 built on the device, or the Phase 2 stamp once the site has it. */
  qr?: { phase: 1 | 2; base64: string; provisional?: boolean };
  /** ZG POS Settings -> Receipt Header, shown under the seller block. */
  headerNote?: string;
  /** ZG POS Settings -> Show Tax Breakdown on Receipt. */
  showTax?: boolean;
};

function sellerInfo(): PartyInfo | undefined {
  const info = useSiteStore.getState().profile?.companyInfo;
  if (!info || !info.name) return undefined;
  return { ...info };
}

function buyerInfo(order: OrderRecord): PartyInfo | undefined {
  const known = order.customerId
    ? queryClient.getQueryData<CustomerRecord[]>(["pos", "customers"])?.find((c) => c.id === order.customerId)
    : undefined;
  if (known) {
    return {
      name: known.name,
      vatNumber: known.vatNumber,
      crNumber: known.crNumber,
      phone: known.phone ?? order.customerPhone ?? undefined,
      email: known.email,
      address: known.address,
    };
  }
  if (!order.customerName) return undefined;
  return { name: order.customerName, phone: order.customerPhone ?? undefined };
}

/** Phase 2 stamp if the site has one, else the server's stored Phase 1 QR, else Phase 1 built here from the sale's own figures. */
function invoiceQr(input: {
  order: OrderRecord;
  seller: PartyInfo | undefined;
  issuedAt: string;
  total: number;
  tax: number;
  provisional: boolean;
}): PosDocument["qr"] {
  if (usePosSettings.getState().settings.counter.invoiceQr === "off") return undefined;
  const { order, seller } = input;
  if (order.zatcaQrP2) return { phase: 2, base64: order.zatcaQrP2 };
  if (order.zatcaQr && !input.provisional) return { phase: 1, base64: order.zatcaQr };
  if (!seller?.vatNumber) return undefined; // a Phase 1 QR needs the seller's VAT number
  const when = new Date(input.issuedAt);
  return {
    phase: 1,
    provisional: input.provisional,
    base64: zatcaTlvBase64({
      sellerName: seller.name,
      vatNumber: seller.vatNumber,
      timestamp: zatcaTimestamp(Number.isNaN(when.getTime()) ? new Date() : when),
      total: input.total,
      vatAmount: input.tax,
    }),
  };
}

export function buildSaleDocument(input: {
  kind: "receipt" | "invoice";
  profile: VerticalProfile;
  order: OrderRecord;
  payment?: PaymentRecord;
  pricing?: { subtotal: number; discount: number; tax: number; total: number };
  cashTendered?: number;
  pendingSyncRef?: string;
}): PosDocument {
  const { order, payment, profile, kind } = input;
  const dining = profile.id === "restaurant" || profile.id === "cafe";
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

  const seller = sellerInfo();
  const settings = usePosSettings.getState().settings;
  const issuedAt = payment?.paidAt ?? order.openedAt;
  return {
    company: seller,
    buyer: buyerInfo(order),
    qr: invoiceQr({ order, seller, issuedAt, total, tax, provisional: Boolean(input.pendingSyncRef) }),
    headerNote: settings.receiptHeader || undefined,
    showTax: settings.showTaxOnReceipt,
    kind,
    businessName: seller?.name ?? `ZatGo POS · ${profile.shortLabel}`,
    subtitle:
      kind === "invoice"
        ? dining
          ? "Tax invoice / guest check"
          : "Tax invoice"
        : "Sales receipt",
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
    pendingSyncRef: input.pendingSyncRef,
    footerNote:
      settings.receiptFooter ||
      (kind === "invoice"
        ? order.channel === "delivery"
          ? "Thank you — delivery invoice. Please retain for your records."
          : dining
            ? "Thank you for dining with us. Please retain this invoice."
            : "Thank you for your purchase. Please retain this invoice."
        : "Thank you for your purchase."),
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

export function documentToHtml(doc: PosDocument, paper: Paper = "80mm"): string {
  return renderInvoiceHtml(doc, paper, {
    formatMoney: money,
    qrSvg: doc.qr ? qrSvgMarkup(doc.qr.base64) : "",
  });
}
