import type { ErrorClass } from "./types.ts";

export type FailureInfo = { status?: number; network?: boolean };

/**
 * Read the failure shape off a thrown value. Only an ApiError flagged `network` is a transport failure; a bare
 * Error (e.g. an envelope with success:false) is a rejection and is NOT retried blindly.
 */
export function failureInfo(err: unknown): FailureInfo {
  if (err && typeof err === "object") {
    const e = err as { status?: unknown; network?: unknown };
    if (e.network === true) return { network: true };
    if (typeof e.status === "number" && e.status > 0) return { status: e.status };
  }
  return { status: 422 };
}

/**
 * How a failed sale post is handled.
 * transient: network, timeout, 5xx (incl. 503 PaymentPendingError), 408, 429 -> retry the SAME client id with backoff.
 * auth: 401/403 -> pause the queue, re-login by the same cashier.
 * switched-off: 404 -> POS / industry switched off, pause.
 * permanent: any other 4xx (417 validation ...) -> needs attention, never auto-retried.
 */
export function classifyFailure(info: FailureInfo): ErrorClass {
  const status = info.status ?? 0;
  if (info.network || status === 0) return "transient";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "switched-off";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "permanent";
}

const BASE_MS = 5_000;
const CAP_MS = 5 * 60_000;

/** Exponential backoff with +-20% jitter; `attempts` counts the tries made so far (>=1). `rand` is injectable for tests. */
export function backoffMs(attempts: number, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempts));
  const raw = Math.min(CAP_MS, BASE_MS * 2 ** (n - 1));
  const jitter = 0.8 + 0.4 * rand();
  return Math.round(Math.min(CAP_MS, raw * jitter));
}
