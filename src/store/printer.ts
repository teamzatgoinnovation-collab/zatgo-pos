import { create } from "zustand";

const STORAGE_KEY = "zatgo-pos-printer";

type StoredPrinter = {
  deviceName: string;
  autoPrintReceipt: boolean;
  silentPrint: boolean;
  openDrawerOnCash: boolean;
  /** Per-device choices; null = follow the site's ZG POS Settings. */
  paper: "80mm" | "a4" | null;
  productView: "grid" | "row" | null;
};

function readStored(): StoredPrinter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<StoredPrinter>;
    return {
      deviceName: typeof parsed.deviceName === "string" ? parsed.deviceName : "",
      autoPrintReceipt: Boolean(parsed.autoPrintReceipt),
      silentPrint: Boolean(parsed.silentPrint),
      openDrawerOnCash: parsed.openDrawerOnCash !== false,
      paper: parsed.paper === "a4" || parsed.paper === "80mm" ? parsed.paper : null,
      productView: parsed.productView === "grid" || parsed.productView === "row" ? parsed.productView : null,
    };
  } catch {
    return {
      deviceName: "",
      autoPrintReceipt: false,
      silentPrint: false,
      openDrawerOnCash: true,
      paper: null,
      productView: null,
    };
  }
}

type PrinterState = StoredPrinter & {
  setDeviceName: (deviceName: string) => void;
  setAutoPrintReceipt: (value: boolean) => void;
  setSilentPrint: (value: boolean) => void;
  setOpenDrawerOnCash: (value: boolean) => void;
  setPaper: (value: "80mm" | "a4" | null) => void;
  setProductView: (value: "grid" | "row" | null) => void;
};

function persist(state: StoredPrinter) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function snapshot(s: StoredPrinter): StoredPrinter {
  return {
    deviceName: s.deviceName,
    autoPrintReceipt: s.autoPrintReceipt,
    silentPrint: s.silentPrint,
    openDrawerOnCash: s.openDrawerOnCash,
    paper: s.paper,
    productView: s.productView,
  };
}

export const usePrinterStore = create<PrinterState>((set, get) => {
  const initial = readStored();
  const update = (patch: Partial<StoredPrinter>) => {
    set(patch);
    persist(snapshot(get()));
  };
  return {
    ...initial,
    setDeviceName: (deviceName) => update({ deviceName }),
    setAutoPrintReceipt: (autoPrintReceipt) => update({ autoPrintReceipt }),
    setSilentPrint: (silentPrint) => update({ silentPrint }),
    setOpenDrawerOnCash: (openDrawerOnCash) => update({ openDrawerOnCash }),
    setPaper: (paper) => update({ paper }),
    setProductView: (productView) => update({ productView }),
  };
});
