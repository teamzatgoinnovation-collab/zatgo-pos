import { Button, cn, FormDialog } from "@zatgo/ui";
import { Printer, RotateCcw } from "@zatgo/icons";
import type { KdsTicket } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";

const statusBg = {
  queued: "bg-[var(--pos-kds-new)]",
  preparing: "bg-[var(--pos-kds-prep)]",
  ready: "bg-[var(--pos-kds-ready)]",
  served: "bg-[var(--color-muted)]",
} as const;

export function KdsTicketDialog({
  open,
  ticket,
  busy,
  onClose,
  onAdvance,
  onRecall,
  onPrintOrder,
  onViewOrder,
}: {
  open: boolean;
  ticket: KdsTicket | null;
  busy?: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onRecall: () => void;
  onPrintOrder: () => void;
  onViewOrder: () => void;
}) {
  if (!ticket) return null;

  const canRecall = ticket.status === "ready" || ticket.status === "preparing";
  const advanceLabel =
    ticket.status === "ready"
      ? "Bump served"
      : ticket.status === "preparing"
        ? "Mark ready"
        : "Start prep";

  const waitMins = Math.max(
    0,
    Math.round((Date.now() - new Date(ticket.openedAt).getTime()) / 60_000),
  );

  return (
    <FormDialog
      open={open}
      title={`KDS · ${ticket.station}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy} onClick={onAdvance}>
            {busy ? "Updating…" : advanceLabel}
          </Button>
        </>
      }
    >
      <div
        className={cn(
          "mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4",
          statusBg[ticket.status] ?? "",
        )}
      >
        <p className="text-xl font-semibold">
          {ticket.qty}× {ticket.name}
        </p>
        {ticket.extras?.length ? (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {formatExtras(ticket.extras)}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          #{ticket.orderNumber} · {ticket.tableName} · {ticket.server}
        </p>
        <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
          {ticket.status} · open {waitMins}m
        </p>
        {ticket.note ? (
          <p className="mt-2 rounded-[var(--radius-lg)] bg-black/5 px-2 py-1.5 text-xs">
            Note: {ticket.note}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy || !canRecall}
          onClick={onRecall}
        >
          <RotateCcw className="size-4" />
          Recall
        </Button>
        <Button variant="outline" className="gap-2" disabled={busy} onClick={onPrintOrder}>
          <Printer className="size-4" />
          Print chit
        </Button>
        <Button variant="outline" disabled={busy} onClick={onViewOrder}>
          Full order
        </Button>
      </div>
    </FormDialog>
  );
}
