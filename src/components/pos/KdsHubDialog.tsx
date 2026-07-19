import { Button, cn, FormDialog } from "@zatgo/ui";
import type { KdsTicket } from "@/lib/pos-repo";

const statusBg = {
  queued: "bg-[var(--pos-kds-new)]",
  preparing: "bg-[var(--pos-kds-prep)]",
  ready: "bg-[var(--pos-kds-ready)]",
} as const;

export function KdsHubDialog({
  open,
  tickets,
  onClose,
  onSelect,
}: {
  open: boolean;
  tickets: KdsTicket[];
  onClose: () => void;
  onSelect: (ticket: KdsTicket) => void;
}) {
  return (
    <FormDialog
      open={open}
      title="Kitchen tickets"
      description="Live KDS board — tap a ticket to advance, recall, or print."
      onClose={onClose}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {tickets.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Kitchen is clear</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onSelect(ticket)}
              className={cn(
                "rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 text-left",
                statusBg[ticket.status as keyof typeof statusBg] ?? "",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {ticket.qty}× {ticket.name}
                </p>
                <span className="text-xs capitalize">{ticket.status}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                #{ticket.orderNumber} · {ticket.tableName} · {ticket.station}
              </p>
              {ticket.extras?.length ? (
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  + {ticket.extras.map((e) => e.name).join(", ")}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
