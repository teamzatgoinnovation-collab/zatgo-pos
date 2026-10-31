import test from "node:test";
import assert from "node:assert/strict";
import { roundMoney } from "./round.ts";

test("a half cent goes to the even cent, like the server", () => {
  assert.equal(roundMoney(1.125), 1.12);
  assert.equal(roundMoney(1.135), 1.14);
  assert.equal(roundMoney(2.025), 2.02);
  assert.equal(roundMoney(0.005), 0);
  assert.equal(roundMoney(0.015), 0.02);
  assert.equal(roundMoney(-1.125), -1.12);
});

test("everything else rounds to the nearest cent", () => {
  assert.equal(roundMoney(8.6249), 8.62);
  assert.equal(roundMoney(8.6251), 8.63);
  assert.equal(roundMoney(15), 15);
  assert.equal(roundMoney(7.5 * 0.15 + 7.5), 8.62);
  assert.equal(roundMoney((15 - 1.5) * 0.15 + 13.5), 15.52);
});
