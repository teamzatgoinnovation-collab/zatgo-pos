import type { PosMode, SiteProfile } from "@/store/site";
import type { PosFeature } from "@/lib/verticals";

/** Floor / orders / KDS / billing exist only when the site's Restaurant industry lists them. */
const INDUSTRY_FEATURE: Partial<Record<PosFeature, string>> = {
  floor: "tables",
  orders: "orders",
  kds: "kds",
  billing: "billing",
};

/** What the Supermarket (retail) POS offers: counter selling, products, stock and reports only. */
const RETAIL_FEATURES: ReadonlySet<PosFeature> = new Set<PosFeature>([
  "sell",
  "catalog",
  "inventory",
  "reports",
]);

export function sitePosMode(site: SiteProfile | null): PosMode | null {
  return site?.posMode ?? null;
}

export function isRetailSite(site: SiteProfile | null): boolean {
  return sitePosMode(site) === "retail";
}

export function siteAllows(site: SiteProfile | null, feature: PosFeature): boolean {
  if (!site) return false;
  const mode = sitePosMode(site);
  if (mode === "retail") return RETAIL_FEATURES.has(feature);
  if (mode !== "restaurant" || !site.restaurant) return false;
  const needed = INDUSTRY_FEATURE[feature];
  return needed ? site.features.includes(needed) : true;
}
