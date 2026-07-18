import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ErpnextSessionStore } from "@zatgo/erpnext";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const erpnext = new ErpnextSessionStore();

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
  ) => erpnext.request(payload),
);

app.whenReady().then(() => {
  createWindow();

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
