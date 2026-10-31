import test from "node:test";
import assert from "node:assert/strict";
import { hueOf } from "./hue.ts";

test("the same category always gets the same hue, in range, case-insensitively", () => {
  assert.equal(hueOf("Dairy"), hueOf("dairy"));
  assert.equal(hueOf("Dairy"), hueOf("Dairy"));
  for (const n of ["", "Dairy", "Bakery", "Drinks", "Products", "عصائر"]) {
    const h = hueOf(n);
    assert.ok(h >= 0 && h < 360);
  }
});

test("different categories mostly get different colours", () => {
  const hues = new Set(["Dairy", "Bakery", "Drinks", "Snacks", "Fruit", "Meat", "Frozen", "Cleaning"].map(hueOf));
  assert.ok(hues.size >= 6);
});
