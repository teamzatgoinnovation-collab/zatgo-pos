import type { PosFeature, VerticalId, VerticalProfile } from "@/lib/verticals";
import { getVertical } from "@/lib/verticals";

/** Modules that can be turned on/off in Setup preferences. */
export type PrefModule = "floor" | "orders" | "kds";

export type ModulePrefs = Record<PrefModule, boolean>;

export const PREF_MODULES: {
  id: PrefModule;
  label: string;
  description: string;
}[] = [
  {
    id: "floor",
    label: "Tables / Floor",
    description: "Table map, seat guests, and request bill from the floor.",
  },
  {
    id: "orders",
    label: "Table orders",
    description: "Open checks, send to kitchen, and manage dine-in tickets.",
  },
  {
    id: "kds",
    label: "Kitchen display",
    description: "KDS board for grill, cold, bar, and dessert stations.",
  },
];

export function isPrefModule(feature: PosFeature): feature is PrefModule {
  return feature === "floor" || feature === "orders" || feature === "kds";
}

export function modulesFromVertical(id: VerticalId): ModulePrefs {
  const profile = getVertical(id);
  return {
    floor: profile.features.includes("floor"),
    orders: profile.features.includes("orders"),
    kds: profile.features.includes("kds"),
  };
}

export function effectiveHasFeature(
  profile: VerticalProfile,
  feature: PosFeature,
  modules: ModulePrefs,
): boolean {
  if (isPrefModule(feature)) return modules[feature];
  return profile.features.includes(feature);
}
