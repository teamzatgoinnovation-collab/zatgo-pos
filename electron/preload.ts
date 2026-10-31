import { contextBridge, ipcRenderer } from "electron";

export type ErpnextLoginResult =
  | { ok: true; user: string; fullName: string; baseUrl: string }
  | { ok: false; message: string };

export type ErpnextSessionInfo = {
  user: string;
  fullName: string;
  baseUrl: string;
};

export type DesktopPrinter = {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  status: number;
};

export type OfflineConnectivity = "online" | "offline" | "auth-expired";

export type OfflinePinResult =
  | { ok: true; user: string; fullName: string }
  | { ok: false; reason: "wrong" | "locked" | "none"; retryInMs?: number };

export type ZatGoDesktopApi = {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<NodeJS.Platform>;
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

const api: ZatGoDesktopApi = {
  getAppVersion: () => ipcRenderer.invoke("desktop:getAppVersion"),
  getPlatform: () => ipcRenderer.invoke("desktop:getPlatform"),
  listPrinters: () => ipcRenderer.invoke("desktop:listPrinters"),
  printHtml: (input) => ipcRenderer.invoke("desktop:printHtml", input),
  openCashDrawer: () => ipcRenderer.invoke("desktop:openCashDrawer"),
  erpnextLogin: (input) => ipcRenderer.invoke("erpnext:login", input),
  erpnextLogout: () => ipcRenderer.invoke("erpnext:logout"),
  erpnextGetSession: () => ipcRenderer.invoke("erpnext:getSession"),
  erpnextRequest: (input) => ipcRenderer.invoke("erpnext:request", input),
  offlineDeviceInfo: () => ipcRenderer.invoke("offline:deviceInfo"),
  offlineNextReceiptSeq: () => ipcRenderer.invoke("offline:nextReceiptSeq"),
  offlineOutboxList: () => ipcRenderer.invoke("offline:outboxList"),
  offlineOutboxAdd: (row) => ipcRenderer.invoke("offline:outboxAdd", row),
  offlineOutboxUpdate: (id, patch) => ipcRenderer.invoke("offline:outboxUpdate", id, patch),
  offlineOutboxRemove: (id) => ipcRenderer.invoke("offline:outboxRemove", id),
  offlineSnapshotGet: (name) => ipcRenderer.invoke("offline:snapshotGet", name),
  offlineSnapshotSet: (name, value) => ipcRenderer.invoke("offline:snapshotSet", name, value),
  offlinePinSet: (input) => ipcRenderer.invoke("offline:pinSet", input),
  offlinePinVerify: (input) => ipcRenderer.invoke("offline:pinVerify", input),
  offlinePinUsers: (scope) => ipcRenderer.invoke("offline:pinUsers", scope),
  offlinePinClear: (scope, user) => ipcRenderer.invoke("offline:pinClear", scope, user),
  offlineGetStatus: () => ipcRenderer.invoke("offline:getStatus"),
  offlineCheckNow: () => ipcRenderer.invoke("offline:checkNow"),
  offlineSetSite: (baseUrl) => ipcRenderer.invoke("offline:setSite", baseUrl),
  offlineProbeAuth: () => ipcRenderer.invoke("offline:probeAuth"),
  offlineOnStatus: (cb) => {
    const listener = (_event: unknown, state: OfflineConnectivity) => cb(state);
    ipcRenderer.on("offline:status", listener);
    return () => {
      ipcRenderer.removeListener("offline:status", listener);
    };
  },
};

contextBridge.exposeInMainWorld("zatgoDesktop", api);
