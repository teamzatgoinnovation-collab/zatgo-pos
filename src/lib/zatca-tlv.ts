/**
 * ZATCA Phase 1 simplified-invoice QR payload: five TLV fields (1 byte tag, 1 byte length, UTF-8 value), Base64.
 * Same format as zatgo-core's services/zatca_qr.py::build_zatca_tlv_base64, so a sale prints the same QR on the device
 * (works offline) as the server stores. A value over 255 bytes is cut at the last whole character that fits.
 */
export type ZatcaFields = {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 date-time, whole seconds, e.g. 2026-10-31T15:49:41 */
  timestamp: string;
  /** Invoice total including VAT. */
  total: number;
  vatAmount: number;
};

const encoder = new TextEncoder();

function tlv(tag: number, value: string): number[] {
  let bytes = encoder.encode(value ?? "");
  if (bytes.length > 255) {
    let end = 255;
    // step back to a character boundary (UTF-8 continuation bytes are 10xxxxxx)
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    bytes = bytes.slice(0, end);
  }
  return [tag, bytes.length, ...bytes];
}

export function zatcaTlvBase64(f: ZatcaFields): string {
  const payload = [
    ...tlv(1, f.sellerName),
    ...tlv(2, f.vatNumber),
    ...tlv(3, f.timestamp),
    ...tlv(4, f.total.toFixed(2)),
    ...tlv(5, f.vatAmount.toFixed(2)),
  ];
  let binary = "";
  for (const b of payload) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Whole-second local ISO time without zone, like the server's `_invoice_timestamp`. */
export function zatcaTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Decode a payload back into its fields (used by tests and to check a stored QR). */
export function decodeZatcaTlv(base64: string): Record<number, string> {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const out: Record<number, string> = {};
  const decoder = new TextDecoder();
  for (let i = 0; i + 1 < bytes.length; ) {
    const tag = bytes[i];
    const len = bytes[i + 1];
    out[tag] = decoder.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}
