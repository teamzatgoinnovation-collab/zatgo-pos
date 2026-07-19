import { Button, cn, FormDialog } from "@zatgo/ui";
import { useEffect, useState } from "react";
import type { ProductExtra, ProductRecord, SelectedExtra } from "@/lib/pos-repo";
import { extrasTotal, lineUnitPrice } from "@/lib/extras";

export function ExtraPickerDialog({
  product,
  open,
  onClose,
  onConfirm,
}: {
  product: ProductRecord | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (extras: SelectedExtra[]) => void;
}) {
  const options = product?.extras ?? [];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open, product?.id]);

  if (!product) return null;

  const selected: ProductExtra[] = options.filter((e) => selectedIds.includes(e.id));
  const unit = lineUnitPrice(
    product.price,
    selected.map((e) => ({ id: e.id, name: e.name, price: e.price })),
  );
  const extrasPrice = extrasTotal(
    selected.map((e) => ({ id: e.id, name: e.name, price: e.price })),
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <FormDialog
      open={open}
      title={product.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(
                selected.map((e) => ({ id: e.id, name: e.name, price: e.price })),
              );
              setSelectedIds([]);
            }}
          >
            Add · ${unit.toFixed(2)}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
        Base ${product.price.toFixed(2)}
        {extrasPrice > 0 ? ` · extras +$${extrasPrice.toFixed(2)}` : ""}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((extra) => {
          const on = selectedIds.includes(extra.id);
          return (
            <button
              key={extra.id}
              type="button"
              onClick={() => toggle(extra.id)}
              className={cn(
                "rounded-[var(--radius-lg)] border px-3 py-3 text-left text-sm transition-colors",
                on
                  ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)]"
                  : "border-[var(--color-border)] hover:bg-[var(--color-muted)]",
              )}
            >
              <p className="font-medium">+ {extra.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-[var(--color-muted-foreground)]">
                {extra.price > 0 ? `+$${extra.price.toFixed(2)}` : "No charge"}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
        Tip: leave extras off and tap Add for a plain item.
      </p>
    </FormDialog>
  );
}
