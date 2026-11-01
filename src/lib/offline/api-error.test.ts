import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, plainMessage } from "./api-error.ts";

test("server HTML becomes plain text", () => {
  assert.equal(plainMessage("Row #1: Item <strong>test item</strong> is &quot;x&quot; &amp; more"), 'Row #1: Item test item is "x" & more');
  assert.equal(plainMessage("a<br>b  <a href='/x'>link</a>"), "a b link");
});

test("a site error with markup reads as one clean line", () => {
  const msg = plainMessage("Row #1: Item <strong>test item</strong> has zero rate but 'Allow Zero Valuation Rate' is not enabled.");
  assert.equal(msg, "Row #1: Item test item has zero rate but 'Allow Zero Valuation Rate' is not enabled.");
});

test("ApiError cleans its message and keeps its status", () => {
  const e = new ApiError("<b>Nope</b>", { status: 417 });
  assert.equal(e.message, "Nope");
  assert.equal(e.status, 417);
});
