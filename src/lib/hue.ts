/** A stable colour (hue 0-359) for a name, so a category always gets the same colour on every screen. Spread over the warm/cool wheel. */
export function hueOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.toLowerCase().charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}
