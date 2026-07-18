import { Button, cn } from "@zatgo/ui";
import { Play, X } from "@zatgo/icons";
import { cartItemCount, cartPricing, type HeldSale } from "@/store/cart";

export function HeldSalesBar({
  held,
  onResume,
  onDiscard,
}: {
  held: HeldSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  if (held.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {held.map((sale) => {
        const pricing = cartPricing(
          sale.lines,
          sale.discountType,
          sale.discountValue,
          sale.taxRate,
        );
        const count = cartItemCount(sale.lines);
        return (
          <div
            key={sale.id}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)]",
              "bg-[var(--color-muted)] px-2 py-1.5",
            )}
          >
            <div className="min-w-0 px-1">
              <p className="truncate text-xs font-medium">{sale.label}</p>
              <p className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                {count} items · ${pricing.total.toFixed(2)}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => onResume(sale.id)}
            >
              <Play className="size-3" />
              Resume
            </Button>
            <button
              type="button"
              className="rounded-[var(--radius-lg)] p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-background)]"
              aria-label={`Discard ${sale.label}`}
              onClick={() => onDiscard(sale.id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
