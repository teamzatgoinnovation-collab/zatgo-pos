import { Button, FormDialog } from "@zatgo/ui";
import { toast } from "sonner";
import { buildSaleDocument } from "@/lib/pos-document";
import { printPosDocument } from "@/lib/print";
import { money } from "@/lib/money";
import { useBusinessStore } from "@/store/business";
import { markRetryNow, pendingCount } from "@/lib/offline/outbox-state";
import { useOutbox } from "@/lib/offline/outbox";
import { recordView } from "@/lib/offline/sale-view";
import { hoursLeft } from "@/lib/offline/limits";
import { usePosSettings } from "@/lib/offline/settings";
import { useConnectivity } from "@/lib/offline/connectivity";
import { syncNote } from "@/lib/offline/sync-note";
import { kickSync, useSyncStatus } from "@/lib/offline/sync-worker";
import type { OutboxRecord, OutboxState } from "@/lib/offline/types";

const STATE_LABEL: Record<OutboxState, string> = {
  pending: "Waiting",
  sending: "Sending…",
  retry_wait: "Will retry",
  synced: "Synced",
  needs_attention: "Needs attention",
};

const STATE_CLASS: Record<OutboxState, string> = {
  pending: "bg-amber-100 text-amber-900",
  sending: "bg-blue-100 text-blue-900",
  retry_wait: "bg-amber-100 text-amber-900",
  synced: "bg-emerald-100 text-emerald-900",
  needs_attention: "bg-red-100 text-red-900",
};

export function PendingSalesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const records = useOutbox((s) => s.records);
  const profile = useBusinessStore((s) => s.profile);
  const settings = usePosSettings((s) => s.settings.offline);
  const net = useConnectivity((s) => s.net);
  const sync = useSyncStatus();
  const note = syncNote({ net, status: sync.status, message: sync.message, waiting: pendingCount(records) });
  const shown = [...records].filter((r) => r.offlineRef).sort((a, b) => b.seq - a.seq);

  const reprint = async (rec: OutboxRecord) => {
    const view = recordView(rec);
    if (!view) return toast.error("This sale has no saved receipt");
    const doc = buildSaleDocument({
      kind: "receipt",
      profile,
      order: view.order,
      payment: view.payment,
      pricing: view.pricing,
      pendingSyncRef: view.pendingSync ? view.offlineRef : undefined,
    });
    const result = await printPosDocument(doc);
    if (result.ok) toast.success("Receipt printed");
    else toast.error(result.message);
  };

  const retry = async (rec: OutboxRecord) => {
    await useOutbox.getState().put(markRetryNow(rec));
    kickSync({ manual: true });
  };

  const dismiss = async (rec: OutboxRecord) => {
    const ok = window.confirm(
      `Sale ${rec.offlineRef} was NOT posted to the site.\n\nRemove it from this device only after a manager has entered it on the site. Remove it now?`,
    );
    if (ok) await useOutbox.getState().remove(rec.id);
  };

  return (
    <FormDialog
      open={open}
      title="Pending sales"
      description="Sales saved on this device. They are posted to the site in order; the final invoice number appears after sync."
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => kickSync({ manual: true })}>
            Sync now
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {note ? (
        <p
          role="status"
          className={`mb-3 rounded-[var(--radius-lg)] border px-3 py-2 text-xs ${
            note.tone === "error"
              ? "border-red-300 bg-red-50 text-red-900"
              : note.tone === "info"
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {note.text}
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No offline sales on this device.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Sold</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((rec) => {
                const left = hoursLeft(rec, settings, Date.now());
                return (
                  <tr key={rec.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{rec.invoice ?? rec.offlineRef}</div>
                      {rec.invoice ? <div className="text-xs text-[var(--color-muted-foreground)]">{rec.offlineRef}</div> : null}
                      <div className="text-xs text-[var(--color-muted-foreground)]">{rec.user}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                      {new Date(rec.saleTime).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {money(rec.expectedTotal)}
                      {!rec.invoice ? <div className="text-[10px] text-[var(--color-muted-foreground)]">provisional</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATE_CLASS[rec.state]}`}>
                        {STATE_LABEL[rec.state]}
                      </span>
                      {rec.review ? (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                          Manager review
                        </span>
                      ) : null}
                      {rec.lastError && rec.state !== "synced" ? (
                        <div className="mt-1 max-w-xs text-xs text-[var(--color-muted-foreground)]">{rec.lastError}</div>
                      ) : null}
                      {rec.issues.map((i, n) => (
                        <div key={n} className="mt-1 max-w-xs text-xs text-amber-800">
                          {i.kind.replaceAll("_", " ")}
                          {i.detail ? `: ${i.detail}` : ""}
                        </div>
                      ))}
                      {rec.state !== "synced" && left <= 12 ? (
                        <div className="mt-1 text-xs text-red-700">
                          {left <= 0 ? "Past the offline time limit — the site may refuse it" : `${Math.floor(left)} h left before the site refuses it`}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => void reprint(rec)}>
                          Reprint
                        </Button>
                        {rec.state === "needs_attention" || rec.state === "retry_wait" ? (
                          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => void retry(rec)}>
                            Retry
                          </Button>
                        ) : null}
                        {rec.state === "needs_attention" ? (
                          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => void dismiss(rec)}>
                            Remove…
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </FormDialog>
  );
}
