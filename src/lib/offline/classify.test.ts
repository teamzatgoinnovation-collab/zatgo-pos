import test from "node:test";
import assert from "node:assert/strict";
import { backoffMs, classifyFailure, failureInfo } from "./classify.ts";
import { ApiError } from "./api-error.ts";

test("classification: transient, auth, switched-off, permanent", () => {
  assert.equal(classifyFailure({ network: true }), "transient");
  assert.equal(classifyFailure({ status: 0 }), "transient");
  assert.equal(classifyFailure({ status: 500 }), "transient");
  assert.equal(classifyFailure({ status: 502 }), "transient");
  assert.equal(classifyFailure({ status: 503 }), "transient"); // PaymentPendingError
  assert.equal(classifyFailure({ status: 429 }), "transient");
  assert.equal(classifyFailure({ status: 401 }), "auth");
  assert.equal(classifyFailure({ status: 403 }), "auth");
  assert.equal(classifyFailure({ status: 404 }), "switched-off");
  assert.equal(classifyFailure({ status: 417 }), "permanent");
  assert.equal(classifyFailure({ status: 400 }), "permanent");
  assert.equal(classifyFailure({ status: 409 }), "permanent");
});

test("failureInfo: ApiError carries status, a bare error is a transport failure", () => {
  assert.deepEqual(failureInfo(new ApiError("x", { status: 417 })), { status: 417 });
  assert.equal(classifyFailure(failureInfo(new Error("Request failed"))), "permanent");
  assert.equal(classifyFailure(failureInfo(new ApiError("down", { network: true }))), "transient");
  assert.equal(classifyFailure(failureInfo(new ApiError("down", { network: true }))), "transient");
  assert.equal(classifyFailure(failureInfo(new ApiError("bad", { status: 417 }))), "permanent");
});

test("backoff grows, is capped and jittered within 20%", () => {
  const mid = () => 0.5;
  assert.equal(backoffMs(1, mid), 5000);
  assert.equal(backoffMs(2, mid), 10000);
  assert.equal(backoffMs(3, mid), 20000);
  assert.equal(backoffMs(20, mid), 300000);
  assert.ok(backoffMs(1, () => 0) >= 4000);
  assert.ok(backoffMs(1, () => 1) <= 6000);
  assert.ok(backoffMs(30, () => 1) <= 300000);
});
