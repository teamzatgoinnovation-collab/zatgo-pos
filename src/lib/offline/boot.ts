import { useSessionStore } from "@/store/session";
import { offlineBridge } from "./bridge.ts";
import { startConnectivity } from "./connectivity.ts";
import { loadOutbox } from "./outbox.ts";
import { readSettingsSnapshot, usePosSettings } from "./settings.ts";
import { currentScope, loadSnapshotMeta, startSnapshotRefresh } from "./snapshot.ts";
import { startSyncWorker } from "./sync-worker.ts";

let booted = false;

/** Start the offline layer once: connectivity, saved queue, saved settings, sync worker, snapshot refresh. */
export async function bootOffline(): Promise<void> {
  if (booted) return;
  booted = true;
  const bridge = offlineBridge();
  startConnectivity();
  if (!bridge) return;
  const pushSite = () => {
    const base = useSessionStore.getState().connection.baseUrl.trim();
    void bridge.offlineSetSite(base || null);
  };
  pushSite();
  let lastBase = useSessionStore.getState().connection.baseUrl;
  useSessionStore.subscribe((s) => {
    if (s.connection.baseUrl !== lastBase) {
      lastBase = s.connection.baseUrl;
      pushSite();
    }
  });
  await loadOutbox();
  const saved = await readSettingsSnapshot(currentScope());
  if (saved) usePosSettings.getState().apply(saved.raw, saved.fetchedAt, "snapshot");
  await loadSnapshotMeta();
  startSyncWorker();
  startSnapshotRefresh();
}
