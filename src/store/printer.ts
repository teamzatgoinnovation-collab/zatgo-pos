import { create } from "zustand";

const STORAGE_KEY = "zatgo-pos-printer";

type StoredPrinter = {
  deviceName: string;
  autoPrintReceipt: boolean;
  silentPrint: boolean;
  openDrawerOnCash: boolean;
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
    };
  } catch {
    return {
      deviceName: "",
      autoPrintReceipt: false,
      silentPrint: false,
      openDrawerOnCash: true,
    };
  }
}

type PrinterState = StoredPrinter & {
  setDeviceName: (deviceName: string) => void;
  setAutoPrintReceipt: (value: boolean) => void;
  setSilentPrint: (value: boolean) => void;
  setOpenDrawerOnCash: (value: boolean) => void;
};

function persist(state: StoredPrinter) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const usePrinterStore = create<PrinterState>((set, get) => {
  const initial = readStored();
  return {
    ...initial,
    setDeviceName: (deviceName) => {
      set({ deviceName });
      const s = get();
      persist({
        deviceName,
        autoPrintReceipt: s.autoPrintReceipt,
        silentPrint: s.silentPrint,
        openDrawerOnCash: s.openDrawerOnCash,
      });
    },
    setAutoPrintReceipt: (autoPrintReceipt) => {
      set({ autoPrintReceipt });
      const s = get();
      persist({
        deviceName: s.deviceName,
        autoPrintReceipt,
        silentPrint: s.silentPrint,
        openDrawerOnCash: s.openDrawerOnCash,
      });
    },
    setSilentPrint: (silentPrint) => {
      set({ silentPrint });
      const s = get();
      persist({
        deviceName: s.deviceName,
        autoPrintReceipt: s.autoPrintReceipt,
        silentPrint,
        openDrawerOnCash: s.openDrawerOnCash,
      });
    },
    setOpenDrawerOnCash: (openDrawerOnCash) => {
      set({ openDrawerOnCash });
      const s = get();
      persist({
        deviceName: s.deviceName,
        autoPrintReceipt: s.autoPrintReceipt,
        silentPrint: s.silentPrint,
        openDrawerOnCash,
      });
    },
  };
});
