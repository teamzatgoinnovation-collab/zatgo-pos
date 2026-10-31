import test from "node:test";
import assert from "node:assert/strict";
import { decodeZatcaTlv, zatcaTimestamp, zatcaTlvBase64 } from "./zatca-tlv.ts";

test("five fields, tags 1-5, in ZATCA order", () => {
  const b64 = zatcaTlvBase64({
    sellerName: "Acme Trading",
    vatNumber: "300000000000003",
    timestamp: "2026-10-31T15:49:41",
    total: 8.62,
    vatAmount: 1.12,
  });
  assert.deepEqual(decodeZatcaTlv(b64), {
    1: "Acme Trading",
    2: "300000000000003",
    3: "2026-10-31T15:49:41",
    4: "8.62",
    5: "1.12",
  });
});

test("byte-exact against the server's encoder (known vector from zatca_qr.py)", () => {
  // tag 1 len 4 "Acme", tag 2 len 3 "123", tag 3 len 19 timestamp, tag 4 len 4 "1.00", tag 5 len 4 "0.15"
  const b64 = zatcaTlvBase64({ sellerName: "Acme", vatNumber: "123", timestamp: "2026-01-02T03:04:05", total: 1, vatAmount: 0.15 });
  assert.equal(b64, "AQRBY21lAgMxMjMDEzIwMjYtMDEtMDJUMDM6MDQ6MDUEBDEuMDAFBDAuMTU=");
});

test("Arabic names count bytes, and an over-long name is cut on a character boundary", () => {
  const arabic = "شركة".repeat(60); // > 255 bytes
  const fields = decodeZatcaTlv(zatcaTlvBase64({ sellerName: arabic, vatNumber: "1", timestamp: "t", total: 1, vatAmount: 0 }));
  assert.ok(new TextEncoder().encode(fields[1]).length <= 255);
  assert.ok(arabic.startsWith(fields[1]));
  assert.equal(fields[2], "1");
});

test("timestamp is local whole seconds", () => {
  assert.equal(zatcaTimestamp(new Date(2026, 9, 31, 5, 4, 3, 999)), "2026-10-31T05:04:03");
});
