import { Button, cn } from "@zatgo/ui";
import { Loader2, Printer } from "@zatgo/icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listDesktopPrinters } from "@/lib/print";
import { usePrinterStore } from "@/store/printer";

type PrinterOption = {
  name: string;
  displayName: string;
  isDefault: boolean;
};

export function PrinterSettings() {
  const deviceName = usePrinterStore((s) => s.deviceName);
  const autoPrintReceipt = usePrinterStore((s) => s.autoPrintReceipt);
  const silentPrint = usePrinterStore((s) => s.silentPrint);
  const openDrawerOnCash = usePrinterStore((s) => s.openDrawerOnCash);
  const setDeviceName = usePrinterStore((s) => s.setDeviceName);
  const setAutoPrintReceipt = usePrinterStore((s) => s.setAutoPrintReceipt);
  const setSilentPrint = usePrinterStore((s) => s.setSilentPrint);
  const setOpenDrawerOnCash = usePrinterStore((s) => s.setOpenDrawerOnCash);

  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const isDesktop = Boolean(window.zatgoDesktop?.listPrinters);

  const refresh = async () => {
    if (!isDesktop) return;
    setLoading(true);
    try {
      const list = await listDesktopPrinters();
      setPrinters(list);
      if (!deviceName) {
        const preferred = list.find((p) => p.isDefault) ?? list[0];
        if (preferred) setDeviceName(preferred.name);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not list printers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [isDesktop]);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">
          Printer &amp; cash drawer
        </h2>
        {isDesktop ? (
          <Button
            variant="outline"
            className="h-8 gap-1.5 px-3 text-xs"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
            Refresh printers
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        {!isDesktop ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Running in the browser — print uses the system dialog. Open the Electron app for
            silent printing and printer selection.
          </p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              Receipt printer
            </span>
            <select
              className="h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-primary)]"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            >
              <option value="">System default / ask</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <Toggle
          checked={autoPrintReceipt}
          onChange={setAutoPrintReceipt}
          label="Auto-print receipt after charge"
          hint="Opens print immediately when a sale completes."
        />
        <Toggle
          checked={silentPrint}
          onChange={setSilentPrint}
          label="Silent print (no dialog)"
          hint="Requires a selected printer in the desktop app."
          disabled={!isDesktop || !deviceName}
        />
        <Toggle
          checked={openDrawerOnCash}
          onChange={setOpenDrawerOnCash}
          label="Open cash drawer on cash sales"
          hint="Sends a drawer kick after a cash receipt print (stub until device wired)."
        />
      </div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="mt-1 size-4 accent-[var(--color-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--color-muted-foreground)]">{hint}</span>
      </span>
    </label>
  );
}
