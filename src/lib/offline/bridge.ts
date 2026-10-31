/** The Electron bridge, when it has the offline IPC (absent in a plain browser tab and in old preloads). */
export function offlineBridge(): NonNullable<Window["zatgoDesktop"]> | null {
  const d = window.zatgoDesktop;
  return d && typeof d.offlineOutboxList === "function" ? d : null;
}

export function offlineSupported(): boolean {
  return offlineBridge() !== null;
}
