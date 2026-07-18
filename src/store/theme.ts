import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  apply: () => void;
};

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "system",
  setMode: (mode) => {
    set({ mode });
    get().apply();
  },
  apply: () => {
    const dark = resolveDark(get().mode);
    document.documentElement.classList.toggle("dark", dark);
  },
}));
