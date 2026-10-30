import { effectiveHasFeature } from "@/lib/modules";
import { siteAllows } from "@/lib/site-features";
import type { PosFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";
import { useSiteStore } from "@/store/site";

/** Effective feature flag: what the site offers AND the Setup module preferences. */
export function useHasFeature(feature: PosFeature): boolean {
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  const site = useSiteStore((s) => s.profile);
  return siteAllows(site, feature) && effectiveHasFeature(profile, feature, modules);
}
