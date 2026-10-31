import { offlineBridge } from "./bridge.ts";
import { checkOfflineSale } from "./limits.ts";
import { newRecord, markSending } from "./outbox-state.ts";
import { useOutbox } from "./outbox.ts";
import { formatOfflineRef, isoWithOffset } from "./receipt-number.ts";
import { snapshotFetchedAt } from "./snapshot.ts";
import { usePosSettings } from "./settings.ts";
import type { OutboxKind, OutboxRecord } from "./types.ts";

/** Raised when a sale cannot be taken offline (limits, card payment ...). The message is for the cashier. */
export class OfflineBlockedError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "OfflineBlockedError";
    this.code = code;
  }
}

export type StageInput = {
  clientId: string;
  kind: OutboxKind;
  /** The call's arguments exactly as an online sale would send them (resto: { create, pay }). */
  payload: Record<string, unknown>;
  user: string;
  company: string | null;
  site: string;
  method: string;
  expectedTotal: number;
  expectedTax: number;
  /** The device clock when the cashier paid. */
  saleTime: Date;
};

let deviceIdCache: string | null = null;

export async function deviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  const info = await offlineBridge()!.offlineDeviceInfo();
  deviceIdCache = info.deviceId;
  return deviceIdCache;
}

/**
 * Write-ahead: the sale and its full payload hit the disk BEFORE any network call or print, so a crash or a
 * dropped connection can never lose it. Returns null when the device has no offline storage (browser tab).
 */
export async function stageSale(input: StageInput): Promise<OutboxRecord | null> {
  if (!offlineBridge()) return null;
  const rec = markSending(
    newRecord({
      id: input.clientId,
      kind: input.kind,
      payload: input.payload,
      user: input.user,
      company: input.company,
      site: input.site,
      deviceId: await deviceId(),
      saleTime: isoWithOffset(input.saleTime),
      offlineRef: "",
      expectedTotal: input.expectedTotal,
      expectedTax: input.expectedTax,
      method: input.method,
      receipt: {},
      seq: 0,
      createdAt: Date.now(),
    }),
  );
  return useOutbox.getState().add(rec);
}

/** Online sale confirmed by the server: the staged copy is not needed any more. */
export async function discardStaged(id: string): Promise<void> {
  await useOutbox.getState().remove(id).catch(() => undefined);
}

/**
 * Turn a staged sale into an offline sale: check the limits, number it, add the offline fields to the payload and
 * leave it `pending` for the sync worker. Throws OfflineBlockedError (and drops the staged copy) when not allowed.
 */
export async function promoteToOffline(
  rec: OutboxRecord,
  buildReceipt: (offlineRef: string) => Record<string, unknown>,
  now: Date = new Date(),
): Promise<OutboxRecord> {
  const bridge = offlineBridge()!;
  const others = useOutbox.getState().records.filter((r) => r.id !== rec.id);
  const verdict = checkOfflineSale({
    settings: usePosSettings.getState().settings.offline,
    now: now.getTime(),
    records: others,
    snapshotFetchedAt: snapshotFetchedAt(),
    method: rec.method,
  });
  if (!verdict.ok) {
    await discardStaged(rec.id);
    throw new OfflineBlockedError(verdict.message, verdict.code);
  }
  const seq = await bridge.offlineNextReceiptSeq();
  const offlineRef = formatOfflineRef(rec.deviceId, now, seq);
  const fields = {
    offline: 1,
    sale_datetime: rec.saleTime,
    offline_ref: offlineRef,
    device_id: rec.deviceId,
    expected_total: Number(rec.expectedTotal.toFixed(2)),
    expected_tax: Number(rec.expectedTax.toFixed(2)),
  };
  const payload =
    rec.kind === "retail.sale"
      ? { ...rec.payload, ...fields }
      : {
          create: { ...(rec.payload.create as object), ...fields },
          pay: { ...(rec.payload.pay as object), ...fields },
        };
  const next: OutboxRecord = {
    ...rec,
    payload,
    offlineRef,
    seq,
    receipt: buildReceipt(offlineRef),
    state: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: "Saved offline — waiting to sync",
  };
  await useOutbox.getState().put(next);
  return next;
}
