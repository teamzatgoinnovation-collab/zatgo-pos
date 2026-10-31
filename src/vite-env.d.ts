/// <reference types="vite/client" />

type ErpnextLoginResult =
  | { ok: true; user: string; fullName: string; baseUrl: string }
  | { ok: false; message: string };

type ErpnextSessionInfo = {
  user: string;
  fullName: string;
  baseUrl: string;
};

type OfflineConnectivity = "online" | "offline" | "auth-expired";

type OfflinePinResult =
  | { ok: true; user: string; fullName: string }
  | { ok: false; reason: "wrong" | "locked" | "none"; retryInMs?: number };

type DesktopPrinter = {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  status: number;
};

type ZatGoDesktopApi = {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  listPrinters: () => Promise<DesktopPrinter[]>;
  printHtml: (input: {
    html: string;
    deviceName?: string;
    silent?: boolean;
    landscape?: boolean;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  openCashDrawer: () => Promise<{ ok: true; stub: true }>;
  erpnextLogin: (input: {
    baseUrl: string;
    usr: string;
    pwd: string;
  }) => Promise<ErpnextLoginResult>;
  erpnextLogout: () => Promise<{ ok: true }>;
  erpnextGetSession: () => Promise<ErpnextSessionInfo | null>;
  erpnextRequest: (input: {
    path: string;
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
  }) => Promise<{ ok: boolean; status: number; bodyText: string }>;
  offlineDeviceInfo: () => Promise<{ deviceId: string; encrypted: boolean; storeError: string | null }>;
  offlineNextReceiptSeq: () => Promise<number>;
  offlineOutboxList: () => Promise<Record<string, unknown>[]>;
  offlineOutboxAdd: (row: Record<string, unknown>) => Promise<Record<string, unknown>>;
  offlineOutboxUpdate: (id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  offlineOutboxRemove: (id: string) => Promise<boolean>;
  offlineSnapshotGet: (name: string) => Promise<unknown | null>;
  offlineSnapshotSet: (name: string, value: unknown) => Promise<void>;
  offlinePinSet: (input: { scope: string; user: string; fullName: string; pin: string }) => Promise<void>;
  offlinePinVerify: (input: { scope: string; user: string; pin: string }) => Promise<OfflinePinResult>;
  offlinePinUsers: (scope: string) => Promise<{ user: string; fullName: string }[]>;
  offlinePinClear: (scope: string, user: string) => Promise<void>;
  offlineGetStatus: () => Promise<OfflineConnectivity>;
  offlineCheckNow: () => Promise<OfflineConnectivity>;
  offlineSetSite: (baseUrl: string | null) => Promise<void>;
  offlineProbeAuth: () => Promise<{ authenticated: boolean }>;
  /** Subscribe to connectivity changes; returns the unsubscribe function. */
  offlineOnStatus: (cb: (state: OfflineConnectivity) => void) => () => void;
};

declare global {
  interface Window {
    zatgoDesktop?: ZatGoDesktopApi;
  }
}

interface ImportMetaEnv {
  readonly VITE_FRAPPE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
