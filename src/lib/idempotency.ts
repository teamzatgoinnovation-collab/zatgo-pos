/**
 * Client ids for financial writes (checkout, payment) — persisted so a
 * retry after an app reload reuses the same id instead of risking a
 * duplicate Sales Invoice / Payment Entry. Non-financial writes (seating a
 * table, opening a tab) don't need this — a duplicate on retry there is a
 * low-stakes, staff-visible mistake, not a financial one.
 */
const PREFIX = "zatgo_pos_cid:";

export function getOrCreateClientId(key: string): string {
  const storageKey = `${PREFIX}${key}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearClientId(key: string): void {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // best-effort
  }
}
