import { useState } from "react";
import { Button, FormDialog } from "@zatgo/ui";
import { toast } from "sonner";
import { offlineBridge } from "@/lib/offline/bridge";
import { currentScope } from "@/lib/offline/snapshot";
import { useSessionStore } from "@/store/session";

const inputClass =
  "h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm tracking-widest outline-none focus:border-[var(--color-primary)]";

/** Set the device PIN that opens the POS without a connection. Only a salted scrypt hash is stored (main process). */
export function DevicePinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const fullName = useSessionStore((s) => s.fullName);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return setError("Use 4 to 8 digits.");
    if (pin !== again) return setError("The two PINs do not match.");
    if (!user) return;
    setBusy(true);
    try {
      await offlineBridge()?.offlinePinSet({ scope: currentScope(), user, fullName: fullName || user, pin });
      toast.success("Device PIN saved");
      setPin("");
      setAgain("");
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the PIN");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title="Device PIN"
      description="Open the POS on this device without a connection. Selling works from saved data; syncing still needs your normal login."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button type="submit" form="pin-form" disabled={busy || !pin}>
            Save PIN
          </Button>
        </>
      }
    >
      <form id="pin-form" onSubmit={(e) => void save(e)} className="space-y-2">
        <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN (4–8 digits)" aria-label="PIN" className={inputClass} />
        <input type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} placeholder="Repeat PIN" aria-label="Repeat PIN" className={inputClass} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </FormDialog>
  );
}
