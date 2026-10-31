import { create } from "zustand";
import { offlineBridge } from "./bridge.ts";
import { pruneSynced, recoverInterrupted } from "./outbox-state.ts";
import type { OutboxRecord } from "./types.ts";

type OutboxStore = {
  records: OutboxRecord[];
  loaded: boolean;
  error: string | null;
  /** Re-read from the main process (the single source of truth for the file). */
  refresh: () => Promise<OutboxRecord[]>;
  add: (rec: OutboxRecord) => Promise<OutboxRecord>;
  /** Replace a stored record with `next` (computed by the pure state machine). */
  put: (next: OutboxRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

function bridge() {
  const b = offlineBridge();
  if (!b) throw new Error("Offline storage is not available in this build");
  return b;
}

export const useOutbox = create<OutboxStore>((set, get) => ({
  records: [],
  loaded: false,
  error: null,
  refresh: async () => {
    const b = offlineBridge();
    if (!b) {
      set({ loaded: true });
      return [];
    }
    try {
      const records = (await b.offlineOutboxList()) as unknown as OutboxRecord[];
      set({ records, loaded: true, error: null });
      return records;
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : "Could not read saved sales" });
      return get().records;
    }
  },
  add: async (rec) => {
    const stored = (await bridge().offlineOutboxAdd(rec as unknown as Record<string, unknown>)) as unknown as OutboxRecord;
    await get().refresh();
    return stored;
  },
  put: async (next) => {
    await bridge().offlineOutboxUpdate(next.id, next as unknown as Record<string, unknown>);
    await get().refresh();
  },
  remove: async (id) => {
    await bridge().offlineOutboxRemove(id);
    await get().refresh();
  },
}));

/** Load the queue at startup: a record left in `sending` by a crash goes back to pending (replay is safe: same client id). */
export async function loadOutbox(): Promise<void> {
  const records = await useOutbox.getState().refresh();
  const recovered = recoverInterrupted(records);
  for (let i = 0; i < records.length; i++) {
    if (recovered[i] !== records[i]) await useOutbox.getState().put(recovered[i]);
  }
}

export async function pruneOutbox(): Promise<void> {
  const { records, remove } = useOutbox.getState();
  const kept = new Set(pruneSynced(records).map((r) => r.id));
  for (const r of records) if (!kept.has(r.id)) await remove(r.id);
}
