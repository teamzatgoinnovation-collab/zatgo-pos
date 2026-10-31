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
}: {
  products: ProductRecord[];
  qtyOf: (productId: string) => number;
  onAdd: (product: ProductRecord) => void;
  className?: string;
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
