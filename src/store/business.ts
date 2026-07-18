import { create } from "zustand";
import {
  modulesFromVertical,
  type ModulePrefs,
  type PrefModule,
} from "@/lib/modules";
import { getVertical, type VerticalId, type VerticalProfile } from "@/lib/verticals";

const VERTICAL_KEY = "zatgo-pos-vertical";
const MODULES_KEY = "zatgo-pos-modules";

function readVertical(): VerticalId {
  try {
    const raw = localStorage.getItem(VERTICAL_KEY);
    if (
      raw === "restaurant" ||
      raw === "cafe" ||
      raw === "supermarket" ||
      raw === "pharmacy" ||
      raw === "electrical" ||
      raw === "general"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "restaurant";
}

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

function persistVertical(id: VerticalId) {
  try {
    localStorage.setItem(VERTICAL_KEY, id);
  } catch {
    /* ignore */
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
  setModule: (id: PrefModule, enabled: boolean) => void;
  setModules: (modules: ModulePrefs) => void;
  resetModulesToProfile: () => void;
};

export const useBusinessStore = create<BusinessState>((set, get) => {
  const verticalId = typeof window !== "undefined" ? readVertical() : "restaurant";
  const modules =
    typeof window !== "undefined" ? readModules(verticalId) : modulesFromVertical(verticalId);

  return {
    verticalId,
    profile: getVertical(verticalId),
    modules,
    setVertical: (id) => {
      const nextModules = modulesFromVertical(id);
      persistVertical(id);
      persistModules(nextModules);
      set({
        verticalId: id,
        profile: getVertical(id),
        modules: nextModules,
      });
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
