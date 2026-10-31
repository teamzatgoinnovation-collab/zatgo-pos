import { create } from "zustand";
import { ZatGoApi } from "@zatgo/erpnext";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import { useSessionStore } from "@/store/session";
import { useBusinessStore } from "@/store/business";
import { VERTICAL_IDS, type VerticalId } from "@/lib/verticals";
import { queryClient } from "@/lib/query-client";
import { clearRetailCache } from "@/lib/retail-cache";
import { offlineBridge } from "@/lib/offline/bridge";
import { failureInfo } from "@/lib/offline/classify";
import { toast } from "sonner";

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
  /** Changes when the company's tax template changes (set by newer cores; null otherwise). */
  taxVersion: string | null;
};

type SiteState = {
  profile: SiteProfile | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** When `profile` was last read from the site (ms); null = never. */
  profileAt: number | null;
  /** True while `profile` comes from the device snapshot instead of the site. */
  fromSnapshot: boolean;
  load: () => Promise<void>;
  /** Re-read the profile from the site without touching `status` (snapshot refresh). */
  refresh: () => Promise<void>;
  /** Cold start without a network: use the saved profile. Returns false when there is none. */
  loadFromSnapshot: () => Promise<boolean>;
  reset: () => void;
};

/** Drop everything cached for the previous site/user/mode (query cache, in-memory retail receipts). */
function dropSiteCaches() {
  queryClient.clear();
  clearRetailCache();
}

function profileScope(): string {
  return useSessionStore.getState().connection.baseUrl.trim().replace(/\/$/, "").toLowerCase();
}

/** Build the app's SiteProfile from `pos_profile.get` data (also used to rebuild it from the snapshot). */
function parseProfile(d: Record<string, unknown>) {
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
  const vertical: VerticalId = VERTICAL_IDS.includes(d.pos_vertical as VerticalId)
    ? (d.pos_vertical as VerticalId)
    : posMode === "retail"
      ? "supermarket"
      : "restaurant";
  const profile: SiteProfile = {
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
    taxVersion: d.tax_version == null ? null : String(d.tax_version),
  };
  return { profile, vertical, posMode };
}

export const useSiteStore = create<SiteState>((set, get) => {
  const apply = (d: Record<string, unknown>, fetchedAt: number, fromSnapshot: boolean) => {
    const { profile, vertical, posMode } = parseProfile(d);
    const prev = get().profile;
    if (prev && (prev.posMode !== posMode || prev.company !== profile.company)) dropSiteCaches();
    if (prev && prev.taxVersion !== profile.taxVersion && !fromSnapshot) {
      toast.info("The site's tax settings changed — prices in new sales use the new tax.");
    }
    useBusinessStore.getState().applySiteVertical(vertical);
    set({ status: "ready", profile, profileAt: fetchedAt, fromSnapshot, error: null });
  };

  const fetchAndStore = async () => {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.posProfile);
    const d = env.data ?? {};
    const now = Date.now();
    apply(d, now, false);
    // Best-effort copy for offline starts; contains no secrets.
    void offlineBridge()?.offlineSnapshotSet("profile", { scope: profileScope(), fetchedAt: now, data: d }).catch(() => undefined);
  };

  return {
    profile: null,
    status: "idle",
    error: null,
    profileAt: null,
    fromSnapshot: false,
    reset: () => {
      useBusinessStore.getState().applySiteVertical("restaurant");
      dropSiteCaches();
      set({ profile: null, status: "idle", error: null, profileAt: null, fromSnapshot: false });
    },
    loadFromSnapshot: async () => {
      try {
        const snap = (await offlineBridge()?.offlineSnapshotGet("profile")) as
          | { scope: string; fetchedAt: number; data: Record<string, unknown> }
          | null
          | undefined;
        if (!snap || snap.scope !== profileScope()) return false;
        apply(snap.data, snap.fetchedAt, true);
        return true;
      } catch {
        return false;
      }
    },
    refresh: async () => {
      await fetchAndStore();
    },
    load: async () => {
      set({ status: "loading", error: null });
      try {
        await fetchAndStore();
      } catch (e) {
        // No network (or the site is down): start from the saved profile so the cashier can still sell.
        const info = failureInfo(e);
        const lostLogin = useSessionStore.getState().offlineUnlocked && (info.status === 401 || info.status === 403);
        const unreachable = info.network || (info.status ?? 0) >= 500 || lostLogin;
        if (unreachable && (await get().loadFromSnapshot())) return;
        set({
          status: "error",
          error: e instanceof Error ? e.message : "Could not read the site profile",
        });
      }
    },
  };
});
