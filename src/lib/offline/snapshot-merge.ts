/** Merging server rows into the device snapshot. Rows are keyed by `id`; a `disabled` row is a tombstone. */

export type SnapRow = Record<string, unknown> & { id?: unknown; modified?: unknown; disabled?: unknown };

export function isDisabled(row: SnapRow): boolean {
  const d = row.disabled;
  return d === true || d === 1 || d === "1";
}

export function rowKey(row: SnapRow): string {
  return String(row.id ?? row.name ?? "");
}

/** Newest `modified` among rows (string order works for Frappe timestamps), or the previous cursor. */
export function maxModified(rows: SnapRow[], previous: string | null = null): string | null {
  let max = previous;
  for (const r of rows) {
    const m = r.modified == null ? "" : String(r.modified);
    if (m && (max === null || m > max)) max = m;
  }
  return max;
}

/** Apply a delta: upsert changed rows, drop tombstones. Never mutates `existing`. */
export function mergeDelta(existing: SnapRow[], delta: SnapRow[]): SnapRow[] {
  const map = new Map<string, SnapRow>();
  for (const r of existing) {
    const k = rowKey(r);
    if (k) map.set(k, r);
  }
  for (const r of delta) {
    const k = rowKey(r);
    if (!k) continue;
    if (isDisabled(r)) map.delete(k);
    else map.set(k, r);
  }
  return [...map.values()];
}

/** A full pull replaces the snapshot; tombstones that slipped in are ignored. */
export function fromFull(rows: SnapRow[]): SnapRow[] {
  return mergeDelta([], rows);
}

/** Pull pages until a short page (the server caps pages at 100 rows; `maxPages` is only a runaway guard). */
export async function pullAllPages(
  fetchPage: (page: number) => Promise<SnapRow[]>,
  pageSize = 100,
  maxPages = 2000,
): Promise<SnapRow[]> {
  const out: SnapRow[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const rows = await fetchPage(page);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error("Snapshot pull did not finish (too many pages)");
}
