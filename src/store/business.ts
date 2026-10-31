import { create } from "zustand";
import {
  modulesFromVertical,
  type ModulePrefs,
  type PrefModule,
} from "@/lib/modules";
import { getVertical, type VerticalId, type VerticalProfile } from "@/lib/verticals";

const MODULES_KEY = "zatgo-pos-modules";

function readModules(verticalId: VerticalId): ModulePrefs {
  const defaults = modulesFromVertical(verticalId);
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ModulePrefs>;
    return {
      floor: typeof parsed.floor === "boolean" ? parsed.floor : defaults.floor,
      orders: typeof parsed.orders === "boolean" ? parsed.orders : defaults.orders,
      kds: typeof parsed.kds === "boolean" ? parsed.kds : defaults.kds,
    };
  } catch {
    return defaults;
  }
}

function persistModules(modules: ModulePrefs) {
  try {
    localStorage.setItem(MODULES_KEY, JSON.stringify(modules));
  } catch {
    /* ignore */
  }
}

type BusinessState = {
  verticalId: VerticalId;
  profile: VerticalProfile;
  modules: ModulePrefs;
  setVertical: (id: VerticalId) => void;
  /** Follow the site's POS Type (restaurant | cafe | supermarket | general). Does not overwrite the saved restaurant module prefs. */
  applySiteVertical: (id: VerticalId) => void;
  setModule: (id: PrefModule, enabled: boolean) => void;
  setModules: (modules: ModulePrefs) => void;
  resetModulesToProfile: () => void;
};

export const useBusinessStore = create<BusinessState>((set, get) => {
  // Until the site profile loads the POS assumes restaurant; the site store then calls applySiteVertical.
  const verticalId: VerticalId = "restaurant";
  const modules =
    typeof window !== "undefined" ? readModules(verticalId) : modulesFromVertical(verticalId);

  return {
    verticalId,
    profile: getVertical(verticalId),
    modules,
    setVertical: (id) => {
      const nextModules = modulesFromVertical(id);
      persistModules(nextModules);
      set({
        verticalId: id,
        profile: getVertical(id),
        modules: nextModules,
      });
    },
    applySiteVertical: (id) => {
      if (get().verticalId === id) return;
      // Restaurant and cafe keep the terminal's saved floor/orders/kds prefs; other verticals use their defaults in
      // memory only (the site gates those modules off in retail mode, so the prefs don't matter there).
      const nextModules = id === "restaurant" || id === "cafe" ? readModules(id) : modulesFromVertical(id);
      set({ verticalId: id, profile: getVertical(id), modules: nextModules });
    },
    setModule: (id, enabled) => {
      const modules = { ...get().modules, [id]: enabled };
      persistModules(modules);
      set({ modules });
    },
    setModules: (modules) => {
      persistModules(modules);
      set({ modules });
    },
    resetModulesToProfile: () => {
      const modules = modulesFromVertical(get().verticalId);
      persistModules(modules);
      set({ modules });
    },
  };
});
