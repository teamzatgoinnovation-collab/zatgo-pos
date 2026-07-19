import { Button, FormDialog } from "@zatgo/ui";
import type { OrderRecord } from "@/lib/pos-repo";
import { posRepo } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";

export function OrdersHubDialog({
  open,
  orders,
  onClose,
  onSelect,
}: {
  open: boolean;
  orders: OrderRecord[];
  onClose: () => void;
  onSelect: (order: OrderRecord) => void;
}) {
  return (
    <FormDialog
      open={open}
      title="Open orders"
      description="Select a check to view details, kitchen, invoice, or void."
      onClose={onClose}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {orders.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No open orders</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => onSelect(order)}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 text-left transition-colors hover:bg-[var(--color-muted)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    #{order.number} · {order.tableName}
                  </p>
                  <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
                    {order.status} · {order.covers} covers · {order.server}
                    {order.channel === "delivery" ? " · delivery" : ""}
                    {order.deliveryStatus === "awaiting" ? " · awaiting handoff" : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  ${posRepo.orderTotal(order).toFixed(2)}
                </p>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                {order.items.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    {item.qty}× {item.name}
                    {item.extras?.length ? ` (${formatExtras(item.extras)})` : ""}
                  </li>
                ))}
                {order.items.length > 3 ? (
                  <li>+{order.items.length - 3} more…</li>
                ) : null}
              </ul>
              {order.note ? (
                <p className="mt-1 text-xs text-[var(--color-foreground)]">Note: {order.note}</p>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
