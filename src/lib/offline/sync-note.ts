import type { ConnectivityState } from "./types.ts";

export type SyncNoteInput = {
  net: ConnectivityState;
  status: "idle" | "syncing" | "offline" | "paused-auth" | "paused-off" | "wrong-user";
  message: string | null;
  /** Sales on this device that the site has not posted yet. */
  waiting: number;
};

/** The one line the Pending sales dialog shows about syncing: why nothing is moving, or that it is. */
export function syncNote(i: SyncNoteInput): { tone: "info" | "warn" | "error"; text: string } | null {
  if (i.waiting <= 0) return null;
  if (i.net === "offline") {
    return { tone: "warn", text: "Offline — these sales sync by themselves as soon as the site can be reached." };
  }
  if (i.net === "auth-expired" || i.status === "paused-auth") {
    return { tone: "warn", text: i.message ?? "Sign in again to sync these sales." };
  }
  if (i.status === "wrong-user") return { tone: "warn", text: i.message ?? "These sales belong to another cashier." };
  if (i.status === "paused-off") return { tone: "error", text: i.message ?? "The POS is switched off on the site." };
  if (i.status === "syncing") return { tone: "info", text: "Syncing…" };
  if (i.message) return { tone: "warn", text: i.message };
  return null;
}
