/**
 * Currency rounding the way the server does it (Frappe's default "Banker's Rounding": a half goes to the even cent), so the
 * total on the receipt is the total ERPNext posts. 1.125 -> 1.12, 1.135 -> 1.14, 2.025 -> 2.02.
 */
export function roundMoney(value: number, places = 2): number {
  const factor = 10 ** places;
  const scaled = value * factor;
  const nearest = Math.round(scaled);
  // a float that is "really" x.5 (1.125 * 100 = 112.5, 2.025 * 100 = 202.49999999999997) is a tie: take the even one
  const isTie = Math.abs(Math.abs(scaled - Math.trunc(scaled)) - 0.5) < 1e-9;
  const result = isTie ? 2 * Math.round(scaled / 2) : nearest;
  return result / factor;
}
