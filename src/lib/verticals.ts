export type VerticalId =
  | "restaurant"
  | "cafe"
  | "supermarket"
  | "pharmacy"
  | "electrical"
  | "general";

export type PosFeature =
  | "floor"
  | "orders"
  | "kds"
  | "sell"
  | "catalog"
  | "billing"
  | "inventory"
  | "reports"
  | "batches"
  | "serials"
  | "prescriptions";

export type VerticalProfile = {
  id: VerticalId;
  label: string;
  shortLabel: string;
  description: string;
  features: PosFeature[];
  catalogNoun: string;
  catalogNounPlural: string;
  /** Primary sell path in the nav */
  primaryAction: "orders" | "sell";
};

const allCommon: PosFeature[] = ["sell", "catalog", "billing", "inventory", "reports"];

export const VERTICALS: VerticalProfile[] = [
  {
    id: "restaurant",
    label: "Restaurant",
    shortLabel: "Restaurant",
    description: "Counter POS plus table service, floor map, and kitchen display.",
    features: [...allCommon, "floor", "orders", "kds"],
    catalogNoun: "Menu item",
    catalogNounPlural: "Menu",
    primaryAction: "sell",
  },
  {
    id: "cafe",
    label: "Café / Coffee shop",
    shortLabel: "Café",
    description: "Counter POS with optional tables and bar/kitchen tickets.",
    features: [...allCommon, "floor", "orders", "kds"],
    catalogNoun: "Menu item",
    catalogNounPlural: "Menu",
    primaryAction: "sell",
  },
  {
    id: "supermarket",
    label: "Supermarket / Grocery",
    shortLabel: "Market",
    description: "Barcode sell, weighable & packaged goods, fast checkout.",
    features: [...allCommon],
    catalogNoun: "Product",
    catalogNounPlural: "Products",
    primaryAction: "sell",
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    shortLabel: "Pharmacy",
    description: "Barcode sell, batches/expiry, and prescription-flagged items.",
    features: [...allCommon, "batches", "prescriptions"],
    catalogNoun: "Medicine",
    catalogNounPlural: "Medicines",
    primaryAction: "sell",
  },
  {
    id: "electrical",
    label: "Electrical / Hardware",
    shortLabel: "Electrical",
    description: "Parts catalog, barcode sell, and serial-tracked items.",
    features: [...allCommon, "serials"],
    catalogNoun: "SKU",
    catalogNounPlural: "Catalog",
    primaryAction: "sell",
  },
  {
    id: "general",
    label: "General retail",
    shortLabel: "Retail",
    description: "Any counter retail shop — sell, catalog, stock, and receipts.",
    features: [...allCommon],
    catalogNoun: "Product",
    catalogNounPlural: "Products",
    primaryAction: "sell",
  },
];

export function getVertical(id: VerticalId): VerticalProfile {
  return VERTICALS.find((v) => v.id === id) ?? VERTICALS[VERTICALS.length - 1]!;
}

/** Profile defaults only. For floor/orders/kds use `useHasFeature` / `effectiveHasFeature` (preferences). */
export function hasFeature(profile: VerticalProfile, feature: PosFeature): boolean {
  return profile.features.includes(feature);
}
