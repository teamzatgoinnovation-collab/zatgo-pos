import { useEffect, useState } from "react";
import { Button } from "@zatgo/ui";
import { useConnectivity } from "@/lib/offline/connectivity";
import { offlineBridge } from "@/lib/offline/bridge";
import { ageLabel } from "@/lib/offline/limits";
import { pendingCount } from "@/lib/offline/outbox-state";
import { useOutbox } from "@/lib/offline/outbox";
import { usePosSettings } from "@/lib/offline/settings";
import { snapshotFetchedAt, useSnapshot } from "@/lib/offline/snapshot";
import { kickSync, useSyncStatus } from "@/lib/offline/sync-worker";
import { useSessionStore } from "@/store/session";
import { PendingSalesDialog } from "./PendingSalesDialog";
import { ReloginDialog } from "./ReloginDialog";

type Tone = "info" | "warn" | "error";

const TONE: Record<Tone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-900",
};

/** One line under the header: online / offline / syncing / sign-in needed, pending count, snapshot age. */
export function OfflineBanner() {
  const net = useConnectivity((s) => s.net);
  const records = useOutbox((s) => s.records);
  const storeError = useOutbox((s) => s.error);
  const sync = useSyncStatus();
  const refreshing = useSnapshot((s) => s.refreshing);
  const catalogAt = useSnapshot((s) => s.catalogAt);
  const settings = usePosSettings((s) => s.settings.offline);
  const user = useSessionStore((s) => s.user);
  const connected = useSessionStore((s) => s.connected);
  const unlocked = useSessionStore((s) => s.offlineUnlocked);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [encrypted, setEncrypted] = useState(true);
  const [, tick] = useState(0);

  useEffect(() => {
    void offlineBridge()?.offlineDeviceInfo().then((i) => setEncrypted(i.encrypted)).catch(() => undefined);
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!offlineBridge()) return null;

  const waiting = records.filter((r) => r.state !== "synced");
  const count = pendingCount(records);
  const attention = records.filter((r) => r.state === "needs_attention").length;
  const age = ageLabel(snapshotFetchedAt() ?? catalogAt, Date.now());
  const needLogin = net === "auth-expired" || (net === "online" && !connected && (unlocked || waiting.length > 0));
  const loginAs = waiting[0]?.user ?? user ?? "";

  let tone: Tone = "info";
  let text: string | null = null;
  if (storeError) {
    tone = "error";
    text = `Saved sales cannot be read on this device: ${storeError} Do not clear app data; contact support.`;
  } else if (net === "offline") {
    tone = "warn";
    text = `Offline — ${settings.enabled ? "sales are saved on this device and sync later" : "offline selling is not enabled on this site"}. ${count} waiting · data saved ${age}`;
  } else if (needLogin) {
    tone = "warn";
    text = `Sign in again to sync${count ? ` ${count} saved sale${count === 1 ? "" : "s"}` : ""}${loginAs ? ` as ${loginAs}` : ""}.`;
  } else if (sync.status === "wrong-user" && sync.message) {
    tone = "warn";
    text = sync.message;
  } else if (sync.status === "paused-off" && sync.message) {
    tone = "error";
    text = sync.message;
  } else if (sync.status === "syncing") {
    text = `Syncing ${count} sale${count === 1 ? "" : "s"}…`;
  } else if (count > 0) {
    tone = attention ? "error" : "warn";
    text = `${count} sale${count === 1 ? "" : "s"} waiting to sync${attention ? ` · ${attention} need attention` : ""}${sync.message ? ` · ${sync.message}` : ""}`;
  } else if (refreshing) {
    text = "Saving products and customers for offline use…";
  } else if (!encrypted) {
    tone = "warn";
    text = "Offline data on this device is stored without OS encryption (no key store available).";
  }

  return (
    <>
      {text ? (
        <div role="status" className={`flex flex-wrap items-center gap-2 border-b px-4 py-1.5 text-xs ${TONE[tone]}`} data-testid="offline-banner">
          <span className="min-w-0 flex-1">{text}</span>
          {needLogin ? (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setLoginOpen(true)}>
              Sign in
            </Button>
          ) : null}
          {net === "online" && count > 0 && !needLogin ? (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => kickSync({ manual: true })}>
              Sync now
            </Button>
          ) : null}
          {count > 0 || records.some((r) => r.offlineRef) ? (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setPendingOpen(true)}>
              Pending sales ({count})
            </Button>
          ) : null}
        </div>
      ) : null}
      <PendingSalesDialog open={pendingOpen} onClose={() => setPendingOpen(false)} />
      <ReloginDialog open={loginOpen} user={loginAs} onClose={() => setLoginOpen(false)} />
    </>
  );
}
