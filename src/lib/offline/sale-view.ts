import type { OrderRecord, PaymentRecord } from "@/lib/pos-models";
import type { RetailPricing } from "@/lib/retail-cache";
import type { OutboxRecord } from "./types.ts";

export type SaleView = {
  order: OrderRecord;
  payment: PaymentRecord;
  pricing: RetailPricing;
  /** True until the site has posted the sale (the receipt then carries the offline number). */
  pendingSync: boolean;
  offlineRef: string;
};

/** Rebuild what a receipt needs from a stored sale (works after a restart and without the site). */
export function recordView(rec: OutboxRecord): SaleView | null {
  const r = rec.receipt as { order?: OrderRecord; payment?: PaymentRecord; pricing?: RetailPricing };
  if (!r.order || !r.payment || !r.pricing) return null;
  const number = rec.invoice ?? rec.offlineRef;
  return {
    order: { ...r.order, number },
    payment: { ...r.payment, orderNumber: number },
    pricing: r.pricing,
    pendingSync: !rec.invoice,
    offlineRef: rec.offlineRef,
  };
}
