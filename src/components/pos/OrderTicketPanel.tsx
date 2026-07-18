import { Button, cn } from "@zatgo/ui";
import { Printer, Receipt } from "@zatgo/icons";
import { AnimatePresence } from "framer-motion";
import type { OrderItem, OrderRecord } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";
import { CartLineItem } from "./CartLineItem";

export function OrderTicketPanel({
  order,
  total,
  sending,
  printing,
  onIncrement,
  onDecrement,
  onRemove,
  onSend,
  onPrintKitchen,
  onOpenDetails,
}: {
  order: OrderRecord | null;
  total: number;
  sending: boolean;
  printing?: boolean;
  onIncrement: (item: OrderItem) => void;
  onDecrement: (item: OrderItem) => void;
  onRemove: (item: OrderItem) => void;
  onSend: () => void;
  onPrintKitchen?: () => void;
  onOpenDetails?: () => void;
}) {
  if (!order) {
    return (
      <section
        className={cn(
          "flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center",
          "bg-[linear-gradient(180deg,var(--pos-sidebar)_0%,var(--color-background)_50%)]",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-muted)]">
          <Receipt className="size-5 text-[var(--color-muted-foreground)]" />
        </div>
        <p className="text-sm font-medium">No open check</p>
        <p className="max-w-xs text-xs text-[var(--color-muted-foreground)]">
          Seat a table on the Floor page to start an order.
        </p>
      </section>
    );
  }

  const count = order.items.reduce((n, i) => n + i.qty, 0);

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]",
        "bg-[linear-gradient(180deg,var(--pos-sidebar)_0%,var(--color-background)_42%)]",
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-[var(--color-muted-foreground)]" />
            <h2 className="text-sm font-semibold">
              #{order.number} · {order.tableName}
            </h2>
            {count > 0 ? (
              <span className="rounded-full bg-[var(--pos-sidebar-active)] px-2 py-0.5 text-xs font-semibold tabular-nums">
                {count}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs capitalize text-[var(--color-muted-foreground)]">
            {order.covers} covers · {order.server} · {order.status}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--color-muted-foreground)]">Total</p>
          <p className="text-xl font-semibold tabular-nums">${total.toFixed(2)}</p>
          {onOpenDetails ? (
            <Button
              variant="ghost"
              className="mt-1 h-7 px-2 text-xs"
              onClick={onOpenDetails}
            >
              Details
            </Button>
          ) : null}
        </div>
      </header>

      <ul className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3">
        {order.items.length === 0 ? (
          <li className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm font-medium">No items yet</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Tap menu items on the right to build the check.
            </p>
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {order.items.map((item) => {
              const editable = item.status === "queued";
              return (
                <CartLineItem
                  key={item.id}
                  line={{
                    id: item.id,
                    name: item.name,
                    unitPrice: item.price,
                    qty: item.qty,
                    meta: item.status,
                    extras: formatExtras(item.extras) || undefined,
                    editable,
                  }}
                  onIncrement={editable ? () => onIncrement(item) : undefined}
                  onDecrement={editable ? () => onDecrement(item) : undefined}
                  onRemove={editable ? () => onRemove(item) : undefined}
                />
              );
            })}
          </AnimatePresence>
        )}
      </ul>

      <footer className="space-y-2 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <Button
          className="h-11 w-full font-semibold"
          disabled={order.items.length === 0 || sending}
          onClick={onSend}
        >
          {sending ? "Sending…" : "Send / refresh kitchen"}
        </Button>
        {onPrintKitchen ? (
          <Button
            variant="outline"
            className="h-10 w-full gap-2"
            disabled={order.items.length === 0 || printing}
            onClick={onPrintKitchen}
          >
            <Printer className="size-4" />
            {printing ? "Printing…" : "Print kitchen ticket"}
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
