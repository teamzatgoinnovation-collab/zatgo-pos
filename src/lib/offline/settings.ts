import { create } from "zustand";
import { offlineBridge } from "./bridge.ts";
import { DEFAULT_OFFLINE_SETTINGS, parseOfflineSettings } from "./limits.ts";
import type { OfflineSettings } from "./types.ts";

/** `pos_settings.get`, read by the client: offline limits, discount policy and receipt fields. */
export type PosSettings = {
  offline: OfflineSettings;
  allowDiscounts: boolean;
  /** 0 = no cap configured. */
  maxDiscountPercent: number;
  receiptHeader: string;
  receiptFooter: string;
  showTaxOnReceipt: boolean;
  printCopies: number;
  defaultPaymentMode: string | null;
  counter: CounterSettings;
};

/** ZG POS Settings -> Counter Screen / Receipt & Printing: how the POS lists products and prints the invoice. */
export type CounterSettings = {
  paperSize: "80mm" | "a4";
  productView: "grid" | "row";
  allowPriceChange: boolean;
  invoiceQr: "phase1" | "off";
};

export function parseCounterSettings(raw: unknown): CounterSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    paperSize: String(d.paper_size ?? "").toLowerCase() === "a4" ? "a4" : "80mm",
    productView: d.product_view === "row" ? "row" : "grid",
    allowPriceChange: d.allow_price_change === 1 || d.allow_price_change === true || d.allow_price_change === "1",
    invoiceQr: d.invoice_qr === "off" ? "off" : "phase1",
  };
}

export const POS_SETTINGS_METHOD = "zatgo_core.api.v1.pos_settings.get";

export function parsePosSettings(raw: unknown): PosSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flag = (v: unknown, dflt: boolean) => (v === undefined || v === null ? dflt : v === true || v === 1 || v === "1");
  const pct = Number(d.max_discount_percent ?? 0);
  return {
    offline: parseOfflineSettings(d.offline),
    allowDiscounts: flag(d.allow_discounts, true),
    maxDiscountPercent: Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0,
    receiptHeader: String(d.receipt_header ?? ""),
    receiptFooter: String(d.receipt_footer ?? ""),
    showTaxOnReceipt: flag(d.show_tax_on_receipt, true),
    printCopies: Math.max(1, Math.floor(Number(d.print_copies ?? 1)) || 1),
    defaultPaymentMode: d.default_payment_mode ? String(d.default_payment_mode) : null,
    counter: parseCounterSettings(d.counter),
  };
}

export const DEFAULT_POS_SETTINGS: PosSettings = parsePosSettings({});

type SettingsStore = {
  settings: PosSettings;
  fetchedAt: number | null;
  /** Where the current value came from. */
  source: "default" | "server" | "snapshot";
  apply: (raw: unknown, fetchedAt: number, source: "server" | "snapshot") => void;
};

export const usePosSettings = create<SettingsStore>((set) => ({
  settings: DEFAULT_POS_SETTINGS,
  fetchedAt: null,
  source: "default",
  apply: (raw, fetchedAt, source) => set({ settings: parsePosSettings(raw), fetchedAt, source }),
}));

export { DEFAULT_OFFLINE_SETTINGS };

export async function persistRawSettings(scope: string, raw: unknown, fetchedAt: number): Promise<void> {
  try {
    await offlineBridge()?.offlineSnapshotSet("settings", { scope, fetchedAt, raw });
  } catch {
    /* best-effort cache */
  }
}

export async function readSettingsSnapshot(scope: string): Promise<{ raw: unknown; fetchedAt: number } | null> {
  try {
    const snap = (await offlineBridge()?.offlineSnapshotGet("settings")) as
      | { scope: string; fetchedAt: number; raw: unknown }
      | null
      | undefined;
    return snap && snap.scope === scope ? { raw: snap.raw, fetchedAt: snap.fetchedAt } : null;
  } catch {
    return null;
  }
}
