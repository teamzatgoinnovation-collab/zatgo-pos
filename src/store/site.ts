import { create } from "zustand";
import { ZatGoApi } from "@zatgo/erpnext";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import { useBusinessStore } from "@/store/business";
import { VERTICAL_IDS, type VerticalId } from "@/lib/verticals";
import { queryClient } from "@/lib/query-client";
import { clearRetailCache } from "@/lib/retail-cache";

export type PosMode = "restaurant" | "retail";

/** What the site (zatgo-core) offers this POS: read from `pos_profile.get`. */
export type SiteProfile = {
  industries: string[];
  restaurant: boolean;
  /** Supermarket (retail) industry is on. */
  retail: boolean;
  /** Which POS the site runs: restaurant wins when both industries are on; null when neither is. */
  posMode: PosMode | null;
  /** Restaurant industry features: tables, orders, kds, billing. */
  features: string[];
  company: string | null;
  currency: string | null;
  paymentModes: string[];
  /** Sales tax from the company template, as a fraction (0.15 = 15%). Set on the site, not here. */
  taxRate: number;
  taxInclusive: boolean;
};

type SiteState = {
  profile: SiteProfile | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
};

/** Drop everything cached for the previous site/user/mode (query cache, in-memory retail receipts). */
function dropSiteCaches() {
  queryClient.clear();
  clearRetailCache();
}

export const useSiteStore = create<SiteState>((set, get) => ({
  profile: null,
  status: "idle",
  error: null,
  reset: () => {
    useBusinessStore.getState().applySiteVertical("restaurant");
    dropSiteCaches();
    set({ profile: null, status: "idle", error: null });
  },
  load: async () => {
    set({ status: "loading", error: null });
    try {
      const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.posProfile);
      const d = env.data ?? {};
      const restaurant = d.restaurant === true;
      const retail = d.retail === true;
      // Older cores don't send pos_mode: derive it the same way the core does.
      const posMode: PosMode | null =
        d.pos_mode === "restaurant" || d.pos_mode === "retail"
          ? d.pos_mode
          : restaurant
            ? "restaurant"
            : retail
              ? "retail"
              : null;
      // The business vertical follows the site's POS Type (older cores: retail -> supermarket, otherwise restaurant).
      const vertical = VERTICAL_IDS.includes(d.pos_vertical as VerticalId)
        ? (d.pos_vertical as VerticalId)
        : posMode === "retail"
          ? "supermarket"
          : "restaurant";
      const prev = get().profile;
      if (prev && (prev.posMode !== posMode || prev.company !== ((d.company as string) || null))) dropSiteCaches();
      useBusinessStore.getState().applySiteVertical(vertical);
      set({
        status: "ready",
        profile: {
          industries: Array.isArray(d.industries) ? (d.industries as string[]) : [],
          restaurant,
          retail,
          posMode,
          features: Array.isArray(d.features) ? (d.features as string[]) : [],
          company: (d.company as string) || null,
          currency: (d.currency as string) || null,
          paymentModes: Array.isArray(d.payment_modes) ? (d.payment_modes as string[]) : [],
          taxRate: Math.max(0, Number(d.tax_rate ?? 0)) / 100,
          taxInclusive: Number(d.tax_inclusive ?? 0) === 1,
        },
      });
    } catch (e) {
      set({
        status: "error",
        error: e instanceof Error ? e.message : "Could not read the site profile",
      });
    }
  },
}));
