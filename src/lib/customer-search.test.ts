import test from "node:test";
import assert from "node:assert/strict";
import type { QueryClient } from "@tanstack/react-query";
import {
  CUSTOMERS_KEY,
  SEARCH_LIMIT,
  customerKey,
  customersKey,
  findKnownCustomer,
  matchCustomers,
  normalizeQuery,
  rememberCustomers,
} from "./customer-search.ts";

const c = (id: string, name: string, phone?: string, extra: Record<string, string> = {}) => ({ id, name, phone, ...extra });

const ROWS = [
  c("CUST-0003", "Zahra Stores", "0555000333"),
  c("CUST-0001", "ahmed trading", "+966 55 111 2222"),
  c("CUST-0002", "Ahmed & Sons", "0551234567"),
  c("CUST-0010", "Walk-in Customer"),
];

/** A Map-backed stand-in for the part of QueryClient the module uses. */
function fakeCache() {
  const store = new Map<string, unknown>();
  const cache = {
    getQueryData: (key: readonly unknown[]) => store.get(JSON.stringify(key)),
    setQueryData: (key: readonly unknown[], data: unknown) => {
      store.set(JSON.stringify(key), data);
      return data;
    },
  } as unknown as Pick<QueryClient, "getQueryData" | "setQueryData">;
  return { cache, store };
}

test("normalizeQuery trims and collapses whitespace", () => {
  assert.equal(normalizeQuery("  ahmed   trading \n"), "ahmed trading");
  assert.equal(normalizeQuery("   "), "");
});

test("no text lists everyone in name order, case-insensitively", () => {
  assert.deepEqual(
    matchCustomers(ROWS, "").map((r) => r.id),
    ["CUST-0002", "CUST-0001", "CUST-0010", "CUST-0003"],
  );
});

test("search matches name, phone and id, in any case", () => {
  assert.deepEqual(matchCustomers(ROWS, "AHMED").map((r) => r.id), ["CUST-0002", "CUST-0001"]);
  assert.deepEqual(matchCustomers(ROWS, "1234567").map((r) => r.id), ["CUST-0002"]);
  assert.deepEqual(matchCustomers(ROWS, "cust-0010").map((r) => r.id), ["CUST-0010"]);
  assert.deepEqual(matchCustomers(ROWS, "  ahmed   trad ").map((r) => r.id), ["CUST-0001"]);
  assert.deepEqual(matchCustomers(ROWS, "nobody"), []);
});

test("search does not mutate the list it is given and caps the answer like the site", () => {
  const many = Array.from({ length: SEARCH_LIMIT + 25 }, (_, i) => c(`C${String(i).padStart(4, "0")}`, `Customer ${String(i).padStart(4, "0")}`));
  const before = many.map((r) => r.id).join();
  const out = matchCustomers(many.slice().reverse(), "");
  assert.equal(out.length, SEARCH_LIMIT);
  assert.equal(out[0].name, "Customer 0000");
  assert.equal(many.map((r) => r.id).join(), before);
  assert.equal(matchCustomers(many, "Customer 01", 5).length, 5);
});

test("a customer past the first page is found by search", () => {
  const many = Array.from({ length: 300 }, (_, i) => c(`C${i}`, `Customer ${String(i).padStart(3, "0")}`, `055000${String(i).padStart(4, "0")}`));
  assert.ok(!matchCustomers(many, "").some((r) => r.id === "C250"));
  assert.deepEqual(matchCustomers(many, "Customer 250").map((r) => r.id), ["C250"]);
  assert.deepEqual(matchCustomers(many, "0550000250").map((r) => r.id), ["C250"]);
});

test("the query keys: no text shares the warm list's entry, one record has its own", () => {
  assert.deepEqual(customersKey(""), CUSTOMERS_KEY);
  assert.deepEqual(customersKey("ahmed"), ["pos", "customers", "search", "ahmed"]);
  assert.deepEqual(customerKey("CUST-1"), ["pos", "customer", "CUST-1"]);
});

test("a picked customer is found with its VAT/CR/address even though the warm list lacks it", () => {
  const { cache } = fakeCache();
  cache.setQueryData([...CUSTOMERS_KEY], [c("CUST-A", "In the first page")]);
  const picked = c("CUST-Z", "Found by search", "0551", { vatNumber: "310000000000003", crNumber: "1010", address: "Riyadh" });
  assert.equal(findKnownCustomer(cache, "CUST-Z"), undefined);
  rememberCustomers(cache, [picked]);
  assert.deepEqual(findKnownCustomer(cache, "CUST-Z"), picked);
  assert.equal(findKnownCustomer(cache, "CUST-A")?.name, "In the first page");
});

test("a refreshed warm list does not lose a picked customer, and the picked record wins", () => {
  const { cache } = fakeCache();
  rememberCustomers(cache, [c("CUST-Z", "Picked", undefined, { vatNumber: "V1" })]);
  cache.setQueryData([...CUSTOMERS_KEY], [c("CUST-Z", "Older copy in the list")]);
  assert.equal(findKnownCustomer(cache, "CUST-Z")?.vatNumber, "V1");
  cache.setQueryData([...CUSTOMERS_KEY], []);
  assert.equal(findKnownCustomer(cache, "CUST-Z")?.name, "Picked");
});

test("no id, an unknown id and empty ids are handled", () => {
  const { cache, store } = fakeCache();
  assert.equal(findKnownCustomer(cache, null), undefined);
  assert.equal(findKnownCustomer(cache, undefined), undefined);
  assert.equal(findKnownCustomer(cache, ""), undefined);
  assert.equal(findKnownCustomer(cache, "nope"), undefined);
  rememberCustomers(cache, [c("", "No id")]);
  assert.equal(store.size, 0);
});
