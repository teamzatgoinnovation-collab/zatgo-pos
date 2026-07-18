import { effectiveHasFeature } from "@/lib/modules";
import type { PosFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";

/** Effective feature flag: vertical defaults + Setup module preferences. */
export function useHasFeature(feature: PosFeature): boolean {
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  return effectiveHasFeature(profile, feature, modules);
}
