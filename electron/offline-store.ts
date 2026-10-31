/**
 * Durable device storage for POS offline mode (main process only; no Electron import so it is unit-testable).
 *
 * Files live under <userData>/offline/ and are written atomically (temp file + fsync + rename).
 * The outbox, the customer snapshot and the PIN file are encrypted with the OS key store when the cipher is
 * available; otherwise they fall back to plain JSON and `deviceInfo().encrypted` says so (the UI shows it).
 * Never stored here: the session cookie, any password, anything secret except the scrypt hash of a device PIN.
 */
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type Cipher = {
  available: () => boolean;
  encrypt: (plain: string) => Buffer;
  decrypt: (data: Buffer) => string;
};

export type OutboxRow = { id: string; [key: string]: unknown };

export type PinResult =
  | { ok: true; user: string; fullName: string }
  | { ok: false; reason: "wrong" | "locked" | "none"; retryInMs?: number };

const ENCRYPTED = new Set(["outbox", "customers", "pin"]);
const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_PIN_FAILURES = 5;

function scrypt(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

type PinEntry = { scope: string; user: string; fullName: string; salt: string; hash: string };

export class OfflineStore {
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, unknown>();
  private storeError: string | null = null;
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  private readonly dir: string;
  private readonly cipher: Cipher;
  private readonly now: () => number;

  constructor(dir: string, cipher: Cipher, now: () => number = Date.now) {
    this.dir = dir;
    this.cipher = cipher;
    this.now = now;
  }

  /** Serialize every operation so reads and writes never interleave. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private file(name: string, enc: boolean) {
    return path.join(this.dir, `${name}${enc ? ".enc" : ".json"}`);
  }

  private async atomicWrite(target: string, data: Buffer | string): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    const handle = await fs.promises.open(tmp, "w", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tmp, target);
  }

  private async readRaw(name: string): Promise<unknown | undefined> {
    const encPath = this.file(name, true);
    const plainPath = this.file(name, false);
    let buf: Buffer | null = null;
    let encrypted = false;
    try {
      buf = await fs.promises.readFile(encPath);
      encrypted = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (!buf) {
      try {
        buf = await fs.promises.readFile(plainPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
      }
    }
    try {
      const text = encrypted ? this.cipher.decrypt(buf) : buf.toString("utf8");
      return JSON.parse(text);
    } catch {
      // Keep the unreadable file untouched (never overwrite possibly-recoverable sales) and surface it.
      const msg = `Saved data "${name}" could not be read (the OS key store may have changed).`;
      if (name === "outbox") this.storeError = msg;
      throw new Error(msg);
    }
  }

  private async load<T>(name: string, fallback: T): Promise<T> {
    if (this.cache.has(name)) return this.cache.get(name) as T;
    const value = ((await this.readRaw(name)) as T | undefined) ?? fallback;
    this.cache.set(name, value);
    return value;
  }

  private async save(name: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    const useEnc = ENCRYPTED.has(name) && this.cipher.available();
    await this.atomicWrite(this.file(name, useEnc), useEnc ? this.cipher.encrypt(json) : json);
    // Drop the other-format twin so a stale copy can never be read back.
    await fs.promises.rm(this.file(name, !useEnc), { force: true });
    this.cache.set(name, value);
  }

  // ---- device ----

  async deviceInfo(): Promise<{ deviceId: string; encrypted: boolean; storeError: string | null }> {
    return this.run(async () => {
      const dev = await this.load<{ deviceId: string; seq: number }>("device", { deviceId: "", seq: 0 });
      if (!dev.deviceId) {
        dev.deviceId = randomUUID();
        await this.save("device", dev);
      }
      return { deviceId: dev.deviceId, encrypted: this.cipher.available(), storeError: this.storeError };
    });
  }

  /** Next per-device receipt sequence; persisted before it is returned so a number is never reused. */
  async nextReceiptSeq(): Promise<number> {
    return this.run(async () => {
      const dev = await this.load<{ deviceId: string; seq: number }>("device", { deviceId: "", seq: 0 });
      if (!dev.deviceId) dev.deviceId = randomUUID();
      const next = { deviceId: dev.deviceId, seq: dev.seq + 1 };
      await this.save("device", next);
      return next.seq;
    });
  }

  // ---- outbox ----

  async outboxList(): Promise<OutboxRow[]> {
    return this.run(async () => [...(await this.load<OutboxRow[]>("outbox", []))]);
  }

  /** Idempotent on id: adding a sale that is already stored returns the stored one (a retry never duplicates). */
  async outboxAdd(row: OutboxRow): Promise<OutboxRow> {
    if (!row || typeof row.id !== "string" || !row.id) throw new Error("outbox record needs an id");
    return this.run(async () => {
      const rows = await this.load<OutboxRow[]>("outbox", []);
      const existing = rows.find((r) => r.id === row.id);
      if (existing) return existing;
      await this.save("outbox", [...rows, row]);
      return row;
    });
  }

  async outboxUpdate(id: string, patch: Record<string, unknown>): Promise<OutboxRow | null> {
    return this.run(async () => {
      const rows = await this.load<OutboxRow[]>("outbox", []);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return null;
      const updated = { ...rows[idx], ...patch, id };
      const next = [...rows];
      next[idx] = updated;
      await this.save("outbox", next);
      return updated;
    });
  }

  async outboxRemove(id: string): Promise<boolean> {
    return this.run(async () => {
      const rows = await this.load<OutboxRow[]>("outbox", []);
      if (!rows.some((r) => r.id === id)) return false;
      await this.save("outbox", rows.filter((r) => r.id !== id));
      return true;
    });
  }

  // ---- snapshots ----

  /** The customer snapshot is personal data: it lives in the encrypted `customers` file, the rest in `snap_<name>`. */
  private snapFile(name: string) {
    if (!NAME_RE.test(name)) throw new Error("bad snapshot name");
    return name === "customers" ? "customers" : `snap_${name}`;
  }

  async snapshotGet(name: string): Promise<unknown | null> {
    const file = this.snapFile(name);
    return this.run(async () => (await this.load<unknown>(file, null)) ?? null);
  }

  async snapshotSet(name: string, value: unknown): Promise<void> {
    const file = this.snapFile(name);
    return this.run(() => this.save(file, value));
  }

  // ---- device PIN ----

  private pinKey(scope: string, user: string) {
    return `${scope}\n${user.toLowerCase()}`;
  }

  async pinSet(input: { scope: string; user: string; fullName: string; pin: string }): Promise<void> {
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error("PIN must be 4-8 digits");
    const salt = randomBytes(16);
    const hash = await scrypt(input.pin, salt);
    return this.run(async () => {
      const all = await this.load<Record<string, PinEntry>>("pin", {});
      const entry: PinEntry = {
        scope: input.scope,
        user: input.user,
        fullName: input.fullName,
        salt: salt.toString("hex"),
        hash: hash.toString("hex"),
      };
      await this.save("pin", { ...all, [this.pinKey(input.scope, input.user)]: entry });
      this.failures.delete(this.pinKey(input.scope, input.user));
    });
  }

  async pinUsers(scope: string): Promise<{ user: string; fullName: string }[]> {
    return this.run(async () => {
      const all = await this.load<Record<string, PinEntry>>("pin", {});
      return Object.values(all)
        .filter((e) => e.scope === scope)
        .map((e) => ({ user: e.user, fullName: e.fullName }));
    });
  }

  async pinClear(scope: string, user: string): Promise<void> {
    return this.run(async () => {
      const all = { ...(await this.load<Record<string, PinEntry>>("pin", {})) };
      delete all[this.pinKey(scope, user)];
      await this.save("pin", all);
    });
  }

  async pinVerify(input: { scope: string; user: string; pin: string }): Promise<PinResult> {
    const key = this.pinKey(input.scope, input.user);
    const lock = this.failures.get(key);
    if (lock && lock.lockedUntil > this.now()) {
      return { ok: false, reason: "locked", retryInMs: lock.lockedUntil - this.now() };
    }
    const entry = await this.run(async () => (await this.load<Record<string, PinEntry>>("pin", {}))[key]);
    if (!entry) return { ok: false, reason: "none" };
    const expected = Buffer.from(entry.hash, "hex");
    const actual = await scrypt(String(input.pin), Buffer.from(entry.salt, "hex"));
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      this.failures.delete(key);
      return { ok: true, user: entry.user, fullName: entry.fullName };
    }
    const count = (lock?.count ?? 0) + 1;
    // After 5 wrong tries lock for 30 s, doubling on each further failure (capped at 10 min).
    const lockedUntil =
      count >= MAX_PIN_FAILURES
        ? this.now() + Math.min(600_000, 30_000 * 2 ** (count - MAX_PIN_FAILURES))
        : 0;
    this.failures.set(key, { count, lockedUntil });
    return lockedUntil
      ? { ok: false, reason: "locked", retryInMs: lockedUntil - this.now() }
      : { ok: false, reason: "wrong" };
  }
}
