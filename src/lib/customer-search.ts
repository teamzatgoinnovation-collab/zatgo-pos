import type { QueryClient } from "@tanstack/react-query";
import type { CustomerRecord } from "./pos-models";

/** The site answers a customer search with at most this many rows (see `posRepo.listCustomers`). */
export const SEARCH_LIMIT = 100;

/** Query key of the customer list the Sell page keeps warm (no search text). */
export const CUSTOMERS_KEY = ["pos", "customers"] as const;

/** Query key of one search; no text is the warm list itself, so both share one cache entry. */
export function customersKey(query: string): readonly string[] {
  return query ? [...CUSTOMERS_KEY, "search", query] : CUSTOMERS_KEY;
}

/** Query key of one customer record picked or saved on this device (survives list refreshes). */
export function customerKey(id: string): readonly string[] {
  return ["pos", "customer", id];
}

export function normalizeQuery(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Search the device copy the way the site does: by name or phone, name order, capped. The id is matched too (the copy has no site to ask). */
export function matchCustomers(rows: CustomerRecord[], query: string, limit = SEARCH_LIMIT): CustomerRecord[] {
  const q = normalizeQuery(query).toLowerCase();
  const hits = q ? rows.filter((c) => `${c.name} ${c.phone ?? ""} ${c.id}`.toLowerCase().includes(q)) : [...rows];
  hits.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  return hits.slice(0, limit);
}

type Cache = Pick<QueryClient, "getQueryData" | "setQueryData">;

/**
 * Keep the full record (VAT, CR, address) of customers the cashier picked or saved. The invoice prints the buyer block from
 * it, and a customer found by search is not in the warm list the Sell page loads (its first page only).
 */
export function rememberCustomers(cache: Cache, rows: CustomerRecord[]): void {
  for (const c of rows) if (c.id) cache.setQueryData(customerKey(c.id), c);
}

/** A customer this device already has a full record for: a picked/saved one first, then the warm list. */
export function findKnownCustomer(cache: Cache, id: string | null | undefined): CustomerRecord | undefined {
  if (!id) return undefined;
  return (
    cache.getQueryData<CustomerRecord>(customerKey(id)) ??
    cache.getQueryData<CustomerRecord[]>(CUSTOMERS_KEY)?.find((c) => c.id === id)
  );
}
