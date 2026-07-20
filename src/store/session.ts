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
  allowMockWithoutLogin: boolean;
  setConnection: (patch: Partial<ConnectionConfig>) => void;
  setSession: (input: {
    connected: boolean;
    user?: string | null;
    fullName?: string | null;
    error?: string | null;
    baseUrl?: string;
  }) => void;
  clearSession: () => void;
  setAllowMockWithoutLogin: (value: boolean) => void;
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
      allowMockWithoutLogin: false,
      setConnection: (patch) =>
        set((state) => ({
          connection: { ...state.connection, ...patch },
          connected: false,
          user: null,
          fullName: null,
          lastError: null,
        })),
      setSession: ({ connected, user = null, fullName = null, error = null, baseUrl }) =>
        set((state) => ({
          connected,
          user,
          fullName,
          lastError: error,
          connection: baseUrl
            ? { ...state.connection, baseUrl }
            : state.connection,
        })),
      clearSession: () =>
        set((state) => ({
          connected: false,
          user: null,
          fullName: null,
          lastError: null,
          connection: state.connection,
          allowMockWithoutLogin: false,
        })),
      setAllowMockWithoutLogin: (value) => set({ allowMockWithoutLogin: value }),
    }),
    {
      name: "zatgo-pos-session",
      partialize: (s) => ({
        connection: { baseUrl: s.connection.baseUrl },
        allowMockWithoutLogin: s.allowMockWithoutLogin,
      }),
    },
  ),
);
