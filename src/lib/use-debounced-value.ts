import { useEffect, useState } from "react";

/** `value`, but only once it has stopped changing for `delayMs` (keeps a search box from asking the site on every key). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}
