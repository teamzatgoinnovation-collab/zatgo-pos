import { useState } from "react";
import { Button, FormDialog } from "@zatgo/ui";
import { toast } from "sonner";
import { loginWithPassword } from "@/lib/client";
import { useSessionStore } from "@/store/session";

/**
 * Sign in again without leaving the screen (the cart and the queue stay). The user is fixed: offline sales sync
 * only under the cashier who made them. The password goes straight to the main process and is never kept.
 */
export function ReloginDialog({ open, user, onClose }: { open: boolean; user: string; onClose: () => void }) {
  const baseUrl = useSessionStore((s) => s.connection.baseUrl);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await loginWithPassword({ baseUrl, usr: user, pwd });
      setPwd("");
      if (result.ok) {
        toast.success("Signed in — syncing saved sales");
        onClose();
      } else {
        setError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title="Sign in to sync"
      description={`Saved sales are posted under ${user}. Sign in as the same cashier.`}
      onClose={() => {
        setPwd("");
        onClose();
      }}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Later
          </Button>
          <Button type="submit" form="relogin-form" disabled={busy || !pwd}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </>
      }
    >
      <form id="relogin-form" onSubmit={(e) => void submit(e)} className="space-y-2 text-sm">
        <p className="text-[var(--color-muted-foreground)]">{user}</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 outline-none focus:border-[var(--color-primary)]"
        />
        {error ? <p className="text-red-600">{error}</p> : null}
      </form>
    </FormDialog>
  );
}
