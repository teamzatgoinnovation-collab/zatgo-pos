import { create } from "zustand";
import { ZatGoApi } from "@zatgo/erpnext";
import { callZatGoApi } from "@/lib/call-zatgo-api";

/** What the site (zatgo-core) offers this POS: read from `pos_profile.get`. */
export type SiteProfile = {
  industries: string[];
  restaurant: boolean;
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

export const useSiteStore = create<SiteState>((set) => ({
  profile: null,
  status: "idle",
  error: null,
  reset: () => set({ profile: null, status: "idle", error: null }),
  load: async () => {
    set({ status: "loading", error: null });
    try {
      const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.posProfile);
      const d = env.data ?? {};
      set({
        status: "ready",
        profile: {
          industries: Array.isArray(d.industries) ? (d.industries as string[]) : [],
          restaurant: d.restaurant === true,
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
