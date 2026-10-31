import { useEffect, useState } from "react";
import { Button } from "@zatgo/ui";
import { useNavigate } from "react-router-dom";
import { offlineBridge } from "@/lib/offline/bridge";
import { currentScope } from "@/lib/offline/snapshot";
import { useSessionStore } from "@/store/session";

/** Open the POS from the saved snapshot with a device PIN (verified in the main process; no password involved). */
export function OfflineUnlock() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<{ user: string; fullName: string }[]>([]);
  const [user, setUser] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void offlineBridge()
      ?.offlinePinUsers(currentScope())
      .then((list) => {
        setUsers(list);
        setUser((u) => u || list[0]?.user || "");
      })
      .catch(() => undefined);
  }, []);

  if (users.length === 0) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await offlineBridge()!.offlinePinVerify({ scope: currentScope(), user, pin });
      setPin("");
      if (res.ok) {
        useSessionStore.getState().unlockOffline(res.user, res.fullName);
        navigate("/sell", { replace: true });
      } else if (res.reason === "locked") {
        setError(`Too many wrong tries. Wait ${Math.ceil((res.retryInMs ?? 30_000) / 1000)} s.`);
      } else {
        setError("Wrong PIN.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="fixed bottom-6 left-1/2 w-[min(92vw,22rem)] -translate-x-1/2 space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-sm shadow-lg"
      data-testid="offline-unlock"
    >
      <p className="font-medium">Open without a connection</p>
      <select
        value={user}
        onChange={(e) => setUser(e.target.value)}
        aria-label="Cashier"
        className="h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-2"
      >
        {users.map((u) => (
          <option key={u.user} value={u.user}>
            {u.fullName || u.user}
          </option>
        ))}
      </select>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Device PIN"
        aria-label="Device PIN"
        className="h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 tracking-widest outline-none focus:border-[var(--color-primary)]"
      />
      {error ? <p className="text-red-600">{error}</p> : null}
      <Button type="submit" disabled={busy || pin.length < 4} className="w-full">
        Unlock with PIN
      </Button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Sales are saved on this device and sync after you sign in normally.
      </p>
    </form>
  );
}
