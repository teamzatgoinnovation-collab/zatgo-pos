import type { ProductExtra, SelectedExtra } from "@/lib/pos-repo";

export function extrasTotal(extras: SelectedExtra[] = []) {
  return extras.reduce((n, e) => n + e.price, 0);
}

export function lineUnitPrice(basePrice: number, extras: SelectedExtra[] = []) {
  return basePrice + extrasTotal(extras);
}

export function extrasKey(extras: SelectedExtra[] = []) {
  return [...extras]
    .map((e) => e.id)
    .sort()
    .join("|");
}

export function sameExtras(a: SelectedExtra[] = [], b: SelectedExtra[] = []) {
  return extrasKey(a) === extrasKey(b);
}

export function formatExtras(extras: SelectedExtra[] = []) {
  if (extras.length === 0) return "";
  return extras
    .map((e) => (e.price > 0 ? `+ ${e.name} (+$${e.price.toFixed(2)})` : `+ ${e.name}`))
    .join(", ");
}

export function extrasSummary(extras: SelectedExtra[] = []) {
  if (extras.length === 0) return "";
  return extras.map((e) => e.name).join(", ");
}

export function toSelectedExtras(extras: ProductExtra[]): SelectedExtra[] {
  return extras.map((e) => ({ id: e.id, name: e.name, price: e.price }));
}
