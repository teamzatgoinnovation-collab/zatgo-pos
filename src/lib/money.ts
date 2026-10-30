import { useSiteStore } from "@/store/site";

/** Format an amount in the site's company currency (falls back to a plain number). */
export function money(amount: number): string {
  const currency = useSiteStore.getState().profile?.currency;
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
    } catch {
      /* unknown currency code */
    }
  }
  return amount.toFixed(2);
}
