import type { OrderRecord } from "@/lib/pos-models";

export type RetailPricing = { subtotal: number; discount: number; tax: number; total: number };

/** Retail sales made in this session (receipt re-open from the Invoices list); site/user specific. */
export const retailSales = new Map<string, { order: OrderRecord; pricing: RetailPricing }>();

export function clearRetailCache(): void {
  retailSales.clear();
}
