/** `OFF-<device short id>-<yymmdd>-<seq>`; the sequence is per device and only ever grows (kept by the main process). */
export function deviceShortId(deviceId: string): string {
  return deviceId.replace(/[^0-9a-zA-Z]/g, "").slice(0, 4).toUpperCase().padEnd(4, "0");
}

export function formatOfflineRef(deviceId: string, date: Date, seq: number): string {
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `OFF-${deviceShortId(deviceId)}-${yy}${mm}${dd}-${String(seq).padStart(4, "0")}`;
}

/** ISO 8601 with the local UTC offset, e.g. 2026-10-31T14:05:09+03:00 (the server needs the offset). */
export function isoWithOffset(date: Date): string {
  const pad = (n: number, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, "0");
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}
