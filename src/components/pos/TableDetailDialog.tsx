import { Button, cn } from "@zatgo/ui";
import { ClipboardList, Receipt, Users } from "@zatgo/icons";
import { FormDialog } from "@/components/FormDialog";
import type { OrderRecord, TableRecord } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";

const statusBg = {
  free: "bg-[var(--pos-floor-free)]",
  occupied: "bg-[var(--pos-floor-occupied)]",
  billing: "bg-[var(--pos-floor-billing)]",
} as const;

export function TableDetailDialog({
  open,
  table,
  order,
  total,
  busy,
  onClose,
  onSeat,
  onOpenOrders,
  onRequestBill,
  onClear,
}: {
  open: boolean;
  table: TableRecord | null;
  order: OrderRecord | null;
  total: number;
  busy?: boolean;
  onClose: () => void;
  onSeat: () => void;
  onOpenOrders: () => void;
  onRequestBill: () => void;
  onClear: () => void;
}) {
  if (!table) return null;

  return (
    <FormDialog
      open={open}
      title={`Table ${table.name}`}
      onClose={onClose}
      className="max-w-md"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div
        className={cn(
          "mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4",
          statusBg[table.status],
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-2xl font-semibold">{table.name}</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {table.zone} · {table.seats} seats
              {table.covers ? ` · ${table.covers} covers` : ""}
            </p>
          </div>
          <span className="text-xs font-medium capitalize">{table.status}</span>
        </div>
      </div>

      {order ? (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Order #{order.number} · {order.server}
            </span>
            <span className="tabular-nums font-semibold">${total.toFixed(2)}</span>
          </div>
          <ul className="max-h-[24vh] space-y-1.5 overflow-auto text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2">
                <span>
                  {item.qty}× {item.name}
                  {item.extras?.length ? (
                    <span className="block text-xs text-[var(--color-muted-foreground)]">
                      {formatExtras(item.extras)}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs capitalize text-[var(--color-muted-foreground)]">
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
          {order.note ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">Note: {order.note}</p>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          No open order on this table.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {table.status === "free" ? (
          <Button className="gap-2 sm:col-span-2" disabled={busy} onClick={onSeat}>
            <Users className="size-4" />
            Seat guests
          </Button>
        ) : (
          <>
            <Button className="gap-2" disabled={busy || !order} onClick={onOpenOrders}>
              <ClipboardList className="size-4" />
              Open order
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={busy || !order}
              onClick={onRequestBill}
            >
              <Receipt className="size-4" />
              Request bill
            </Button>
            <Button
              variant="outline"
              className="sm:col-span-2"
              disabled={busy}
              onClick={onClear}
            >
              Clear table
            </Button>
          </>
        )}
      </div>
    </FormDialog>
  );
}
