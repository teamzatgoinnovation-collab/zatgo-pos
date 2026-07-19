import { Button, FormDialog } from "@zatgo/ui";
import { Play, X } from "@zatgo/icons";
import { cartItemCount, cartPricing, type HeldSale } from "@/store/cart";
import { formatExtras } from "@/lib/extras";

export function HeldHubDialog({
  open,
  held,
  onClose,
  onResume,
  onDiscard,
}: {
  open: boolean;
  held: HeldSale[];
  onClose: () => void;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <FormDialog
      open={open}
      title="Held sales"
      description="Parked carts — resume to continue or discard."
      onClose={onClose}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {held.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No held sales</p>
      ) : (
        <ul className="space-y-2">
          {held.map((sale) => {
            const pricing = cartPricing(
              sale.lines,
              sale.discountType,
              sale.discountValue,
              sale.taxRate,
            );
            return (
              <li
                key={sale.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{sale.label}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {new Date(sale.heldAt).toLocaleString()} · {cartItemCount(sale.lines)}{" "}
                      items · ${pricing.total.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={() => onResume(sale.id)}
                    >
                      <Play className="size-3.5" />
                      Resume
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 px-2"
                      aria-label={`Discard ${sale.label}`}
                      onClick={() => onDiscard(sale.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {sale.lines.slice(0, 4).map((line) => (
                    <li key={line.lineId}>
                      {line.qty}× {line.product.name}
                      {line.extras.length
                        ? ` (${formatExtras(line.extras)})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </FormDialog>
  );
}
