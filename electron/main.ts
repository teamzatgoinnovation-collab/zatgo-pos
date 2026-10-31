import { app, BrowserWindow, ipcMain, net, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ErpnextSessionStore } from "@zatgo/erpnext";
import { Heartbeat } from "./heartbeat";
import { OfflineStore } from "./offline-store";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const erpnext = new ErpnextSessionStore();

// POS offline: the one place a local queue is allowed (see desktop/CLAUDE.md). Files live in userData/offline.
const offlineStore = new OfflineStore(path.join(app.getPath("userData"), "offline"), {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data),
});
let configuredSite: string | null = null;
const heartbeat = new Heartbeat({
  getBaseUrl: () => erpnext.get()?.baseUrl ?? configuredSite,
  isNetOnline: () => net.isOnline(),
  fetchFn: (url, init) => fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: init.signal }),
  emit: (state) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send("offline:status", state);
  },
});

/** A 401, or a 403 where the session turned out to be Guest, means the cookie is gone: the queue needs a re-login. */
async function sessionIsLost(): Promise<boolean> {
  try {
    const res = await erpnext.request({ path: "/api/method/frappe.auth.get_logged_user", method: "GET" });
    if (res.status === 401 || res.status === 403) return true;
    const body = JSON.parse(res.bodyText || "{}") as { message?: string };
    return !body.message || body.message === "Guest";
  } catch {
    return false;
  }
}

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, "../public");

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: "ZatGo POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST!, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("desktop:getAppVersion", () => app.getVersion());
ipcMain.handle("desktop:getPlatform", () => process.platform);

ipcMain.handle("desktop:listPrinters", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    description: p.description ?? "",
    isDefault: Boolean(p.isDefault),
    status: p.status,
  }));
});

ipcMain.handle(
  "desktop:printHtml",
  async (
    _event,
    payload: {
      html: string;
      deviceName?: string;
      silent?: boolean;
      landscape?: boolean;
      paper?: "80mm" | "a4";
    },
  ) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    try {
      await printWin.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`,
      );
      // A4 is a standard page; an 80mm roll is 80 mm wide and as tall as the receipt (microns).
      let pageSize: "A4" | { width: number; height: number } = "A4";
      if (payload.paper !== "a4") {
        const heightPx = Number(
          await printWin.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)"),
        );
        pageSize = { width: 80_000, height: Math.max(100_000, Math.round((Number.isFinite(heightPx) ? heightPx : 600) * 264.58) + 10_000) };
      }
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        };
        // Chromium can omit the print callback when printer settings are invalid.
        const timer = setTimeout(() => {
          finish(new Error("Print timed out — check printer settings"));
        }, 20_000);

        try {
          printWin.webContents.print(
            {
              silent: Boolean(payload.silent && payload.deviceName),
              deviceName: payload.deviceName,
              printBackground: true,
              landscape: Boolean(payload.landscape),
              pageSize,
            },
            (success, failureReason) => {
              if (!success) {
                finish(new Error(failureReason || "Print cancelled"));
                return;
              }
              finish();
            },
          );
        } catch (err) {
          finish(err instanceof Error ? err : new Error("Print failed"));
        }
      });
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : "Print failed",
      };
    } finally {
      if (!printWin.isDestroyed()) printWin.close();
    }
  },
);

ipcMain.handle("desktop:openCashDrawer", async () => {
  // Stub until ESC/POS / drawer kick is wired to a device.
  return { ok: true as const, stub: true as const };
});

ipcMain.handle(
  "erpnext:login",
  async (_event, payload: { baseUrl: string; usr: string; pwd: string }) => {
    const result = await erpnext.login(payload);
    if (!result.ok) return result;
    configuredSite = result.session.baseUrl;
    heartbeat.setAuthExpired(false);
    void heartbeat.check();
    return {
      ok: true as const,
      user: result.session.user,
      fullName: result.session.fullName,
      baseUrl: result.session.baseUrl,
    };
  },
);

ipcMain.handle("erpnext:logout", async () => {
  await erpnext.logout();
  heartbeat.setAuthExpired(false);
  return { ok: true as const };
});

ipcMain.handle("erpnext:getSession", () => {
  const s = erpnext.get();
  if (!s) return null;
  return { user: s.user, fullName: s.fullName, baseUrl: s.baseUrl };
});

ipcMain.handle(
  "erpnext:request",
  async (
    _event,
    payload: {
      path: string;
      method?: string;
      body?: string | null;
      headers?: Record<string, string>;
    },
  ) => {
    let res: Awaited<ReturnType<typeof erpnext.request>>;
    try {
      res = await erpnext.request(payload);
    } catch (err) {
      heartbeat.reportNetworkFailure();
      throw err;
    }
    heartbeat.reportReachable();
    if (res.status === 401) heartbeat.setAuthExpired(true);
    else if (res.status === 403) heartbeat.setAuthExpired(await sessionIsLost());
    else if (res.ok) heartbeat.setAuthExpired(false);
    return res;
  },
);

// ---- POS offline IPC (no secrets cross it: cookies and passwords never reach the store) ----
ipcMain.handle("offline:deviceInfo", () => offlineStore.deviceInfo());
ipcMain.handle("offline:nextReceiptSeq", () => offlineStore.nextReceiptSeq());
ipcMain.handle("offline:outboxList", () => offlineStore.outboxList());
ipcMain.handle("offline:outboxAdd", (_e, row) => offlineStore.outboxAdd(row));
ipcMain.handle("offline:outboxUpdate", (_e, id: string, patch: Record<string, unknown>) =>
  offlineStore.outboxUpdate(id, patch),
);
ipcMain.handle("offline:outboxRemove", (_e, id: string) => offlineStore.outboxRemove(id));
ipcMain.handle("offline:snapshotGet", (_e, name: string) => offlineStore.snapshotGet(name));
ipcMain.handle("offline:snapshotSet", (_e, name: string, value: unknown) => offlineStore.snapshotSet(name, value));
ipcMain.handle("offline:pinSet", (_e, input) => offlineStore.pinSet(input));
ipcMain.handle("offline:pinVerify", (_e, input) => offlineStore.pinVerify(input));
ipcMain.handle("offline:pinUsers", (_e, scope: string) => offlineStore.pinUsers(scope));
ipcMain.handle("offline:pinClear", (_e, scope: string, user: string) => offlineStore.pinClear(scope, user));
ipcMain.handle("offline:getStatus", () => heartbeat.state());
ipcMain.handle("offline:checkNow", () => heartbeat.check());
ipcMain.handle("offline:setSite", (_e, baseUrl: string | null) => {
  configuredSite = baseUrl ? String(baseUrl).trim().replace(/\/$/, "") : null;
  void heartbeat.check();
});
ipcMain.handle("offline:probeAuth", async () => {
  if (!erpnext.get()) return { authenticated: false };
  return { authenticated: !(await sessionIsLost()) };
});

app.whenReady().then(() => {
  createWindow();
  heartbeat.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
