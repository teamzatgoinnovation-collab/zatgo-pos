import { Button, cn } from "@zatgo/ui";
import { Minus, Plus, Trash2 } from "@zatgo/icons";
import { motion } from "framer-motion";

export type LineDisplay = {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
  unit?: string;
  meta?: string;
  extras?: string;
  editable?: boolean;
};

export function CartLineItem({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: LineDisplay;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
}) {
  const lineTotal = line.qty * line.unitPrice;
  const editable = line.editable !== false;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] p-3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-snug">{line.name}</p>
          {line.extras ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{line.extras}</p>
          ) : null}
          <p className="mt-0.5 text-xs tabular-nums text-[var(--color-muted-foreground)]">
            ${line.unitPrice.toFixed(2)}
            {line.unit ? ` / ${line.unit}` : ""} each
            {line.meta ? ` · ${line.meta}` : ""}
          </p>
        </div>
        {editable && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-[var(--radius-lg)] p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            aria-label={`Remove ${line.name}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {editable && onIncrement && onDecrement ? (
          <div className="flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-0.5">
            <Button
              variant="ghost"
              className="size-8 p-0"
              onClick={onDecrement}
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
              {line.qty}
            </span>
            <Button
              variant="ghost"
              className="size-8 p-0"
              onClick={onIncrement}
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : (
          <span className="text-sm tabular-nums text-[var(--color-muted-foreground)]">
            ×{line.qty}
          </span>
        )}
        <span className="text-sm font-semibold tabular-nums">${lineTotal.toFixed(2)}</span>
      </div>
    </motion.li>
  );
}
