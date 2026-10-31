import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ConnectionConfig = {
  baseUrl: string;
};

type SessionState = {
  connection: ConnectionConfig;
  connected: boolean;
  user: string | null;
  fullName: string | null;
  lastError: string | null;
  /** True when the POS was opened with a device PIN (no live login): selling is queued, syncing needs a real login. */
  offlineUnlocked: boolean;
  setConnection: (patch: Partial<ConnectionConfig>) => void;
  setSession: (input: {
    connected: boolean;
    user?: string | null;
    fullName?: string | null;
    error?: string | null;
    baseUrl?: string;
  }) => void;
  /** Open the POS from the device snapshot after a successful PIN check (main process verified it). */
  unlockOffline: (user: string, fullName: string) => void;
  clearSession: () => void;
};

const defaultBaseUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_FRAPPE_BASE_URL) ||
  "https://demo.zatgo.online";

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      connection: { baseUrl: defaultBaseUrl },
      connected: false,
      user: null,
      fullName: null,
      lastError: null,
      offlineUnlocked: false,
      setConnection: (patch) =>
        set((state) => ({
          connection: { ...state.connection, ...patch },
          connected: false,
          user: null,
          fullName: null,
          lastError: null,
          offlineUnlocked: false,
        })),
      setSession: ({ connected, user = null, fullName = null, error = null, baseUrl }) =>
        set((state) => ({
          connected,
          user,
          fullName,
          lastError: error,
          offlineUnlocked: false,
          connection: baseUrl
            ? { ...state.connection, baseUrl }
            : state.connection,
        })),
      unlockOffline: (user, fullName) =>
        set({ connected: false, user, fullName, lastError: null, offlineUnlocked: true }),
      clearSession: () =>
        set((state) => ({
          connected: false,
          user: null,
          fullName: null,
          lastError: null,
          offlineUnlocked: false,
          connection: state.connection,
        })),
    }),
    {
      name: "zatgo-pos-session",
      // An explicit VITE_FRAPPE_BASE_URL wins over the site saved from a previous run.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<SessionState>) };
        const envUrl = import.meta.env?.VITE_FRAPPE_BASE_URL;
        if (envUrl) merged.connection = { ...merged.connection, baseUrl: envUrl };
        return merged;
      },
      partialize: (s) => ({
        connection: { baseUrl: s.connection.baseUrl },
      }),
    },
  ),
);
