/**
 * Connectivity heartbeat (main process). Reachability = `net.isOnline()` and GET <site>/api/method/ping;
 * auth-expired is set when an authenticated call came back 401/403 (and a 403 was confirmed to be a lost session).
 * No Electron import: everything it needs is injected so it can be unit-tested.
 */
export type ConnectivityState = "online" | "offline" | "auth-expired";

export type HeartbeatDeps = {
  getBaseUrl: () => string | null;
  isNetOnline: () => boolean;
  fetchFn: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;
  emit: (state: ConnectivityState) => void;
  intervalMs?: number;
  timeoutMs?: number;
};

export class Heartbeat {
  private reachable = false;
  private authExpired = false;
  private last: ConnectivityState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<ConnectivityState> | null = null;
  private readonly deps: HeartbeatDeps;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  state(): ConnectivityState {
    if (!this.reachable) return "offline";
    return this.authExpired ? "auth-expired" : "online";
  }

  start() {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), this.deps.intervalMs ?? 15_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private publish() {
    const s = this.state();
    if (s !== this.last) {
      this.last = s;
      this.deps.emit(s);
    }
    return s;
  }

  /** Probe now (shared by concurrent callers). */
  check(): Promise<ConnectivityState> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        const base = this.deps.getBaseUrl();
        if (!base || !this.deps.isNetOnline()) {
          this.reachable = false;
        } else {
          try {
            const res = await this.deps.fetchFn(`${base}/api/method/ping`, {
              signal: AbortSignal.timeout(this.deps.timeoutMs ?? 5_000),
            });
            this.reachable = res.ok;
          } catch {
            this.reachable = false;
          }
        }
        return this.publish();
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** An authenticated request failed at transport level: assume offline now, confirm on the next probe. */
  reportNetworkFailure() {
    this.reachable = false;
    this.publish();
    void this.check();
  }

  /** An authenticated request got an HTTP answer: the site is reachable. */
  reportReachable() {
    if (!this.reachable) {
      this.reachable = true;
      this.publish();
    }
  }

  setAuthExpired(expired: boolean) {
    if (this.authExpired === expired) return;
    this.authExpired = expired;
    this.publish();
  }
}
