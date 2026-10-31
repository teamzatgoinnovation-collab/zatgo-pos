import { create } from "zustand";
import { offlineBridge } from "./bridge.ts";
import type { ConnectivityState } from "./types.ts";

type ConnectivityStore = {
  net: ConnectivityState;
  /** True once the first status arrived (before that we assume online and do not flash a banner). */
  ready: boolean;
  set: (net: ConnectivityState) => void;
  /** A call failed at transport level: show offline now; the main-process heartbeat confirms or corrects it. */
  markNetworkFailure: () => void;
  checkNow: () => Promise<void>;
};

export const useConnectivity = create<ConnectivityStore>((set, get) => ({
  net: "online",
  ready: false,
  set: (net) => set({ net, ready: true }),
  markNetworkFailure: () => {
    if (get().net === "online") set({ net: "offline" });
    void get().checkNow();
  },
  checkNow: async () => {
    const b = offlineBridge();
    if (!b) return;
    try {
      get().set(await b.offlineCheckNow());
    } catch {
      /* the next heartbeat will tell */
    }
  },
}));

let started = false;

/** Subscribe once to main-process status events; falls back to the browser's online/offline events without a bridge. */
export function startConnectivity(): void {
  if (started) return;
  started = true;
  const b = offlineBridge();
  const store = useConnectivity.getState();
  if (b) {
    b.offlineOnStatus((s) => useConnectivity.getState().set(s));
    void b.offlineGetStatus().then((s) => store.set(s)).catch(() => undefined);
  } else {
    store.set(navigator.onLine ? "online" : "offline");
    window.addEventListener("online", () => useConnectivity.getState().set("online"));
    window.addEventListener("offline", () => useConnectivity.getState().set("offline"));
  }
}
