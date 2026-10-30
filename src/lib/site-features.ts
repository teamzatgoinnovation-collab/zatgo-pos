import type { SiteProfile } from "@/store/site";
import type { PosFeature } from "@/lib/verticals";

/** Floor / orders / KDS / billing exist only when the site's Restaurant industry lists them. */
const INDUSTRY_FEATURE: Partial<Record<PosFeature, string>> = {
  floor: "tables",
  orders: "orders",
  kds: "kds",
  billing: "billing",
};

export function siteAllows(site: SiteProfile | null, feature: PosFeature): boolean {
  if (!site) return false;
  if (!site.restaurant) return false;
  const needed = INDUSTRY_FEATURE[feature];
  return needed ? site.features.includes(needed) : true;
}
