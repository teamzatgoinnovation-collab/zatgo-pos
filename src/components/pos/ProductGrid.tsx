import { cn } from "@zatgo/ui";
import { motion } from "framer-motion";
import type { ProductRecord } from "@/lib/pos-repo";
import { money } from "@/lib/money";
import { hueOf } from "@/lib/hue";

export function ProductGrid({
  products,
  qtyOf,
  onAdd,
  className,
  compact,
  view = "grid",
}: {
  products: ProductRecord[];
  qtyOf: (productId: string) => number;
  onAdd: (product: ProductRecord) => void;
  className?: string;
  /** "row" = one compact line per product (name, SKU, price, stock); "grid" = tiles. */
  view?: "grid" | "row";
  compact?: boolean;
}) {
  if (products.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-10">
        <p className="max-w-sm text-center text-sm text-[var(--color-muted-foreground)]">
          No products match. Add catalog items in Menu.
        </p>
      </div>
    );
  }

  if (view === "row") {
    return (
      <div className={cn("flex h-full flex-col gap-1 overflow-auto", className)}>
        {products.map((product) => {
          const qty = qtyOf(product.id);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onAdd(product)}
              style={{ "--hue": hueOf(product.category || "General") } as React.CSSProperties}
              className={cn(
                "pos-tile flex items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2 text-left transition-all",
                qty > 0 && "ring-2 ring-[var(--color-primary)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>
              <span className="hidden w-32 shrink-0 truncate text-xs text-[var(--color-muted-foreground)] sm:block">
                {product.sku}
              </span>
              {product.stockQty !== undefined ? (
                <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted-foreground)] md:block">
                  {product.stockQty} in stock
                </span>
              ) : null}
              <span className="pos-tile-price w-24 shrink-0 text-right text-sm font-bold tabular-nums">
                {money(product.price)}
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  qty > 0 ? "pos-brand-bg" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                )}
              >
                {qty > 0 ? qty : "+"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid h-full auto-rows-min gap-2 overflow-auto",
        compact
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {products.map((product) => {
        const qty = qtyOf(product.id);
        const hasExtras = Boolean(product.extras?.length);
        const badges = [
          product.requiresPrescription ? "Rx" : null,
          product.trackSerial ? "SN" : null,
          product.trackBatch ? "Batch" : null,
          hasExtras ? "Extras" : null,
        ].filter(Boolean);

        return (
          <motion.button
            key={product.id}
            type="button"
            layout
            whileTap={{ scale: 0.97 }}
            onClick={() => onAdd(product)}
            style={{ "--hue": hueOf(product.category || "General") } as React.CSSProperties}
            className={cn(
              "pos-tile relative flex min-h-[108px] flex-col rounded-[var(--radius-lg)] border p-3 text-left transition-all",
              qty > 0 && "ring-2 ring-[var(--color-primary)]",
            )}
          >
            {qty > 0 ? (
              <span className="pos-brand-bg absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums text-[var(--color-primary-foreground)]">
                {qty}
              </span>
            ) : null}
            <p className="pr-7 text-sm font-medium leading-snug">{product.name}</p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {product.sku}
              {badges.length ? ` · ${badges.join(" · ")}` : ""}
            </p>
            <p className="pos-tile-price mt-auto pt-3 text-base font-bold tabular-nums">
              {money(product.price)}
              {product.unit ? (
                <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                  {" "}
                  / {product.unit}
                </span>
              ) : null}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
}
