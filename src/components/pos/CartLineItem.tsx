import { useEffect, useRef, useState } from "react";
import { cn } from "@zatgo/ui";
import { Minus, Plus, X } from "@zatgo/icons";
import { money } from "@/lib/money";

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

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] active:bg-[var(--color-muted)]";

/** One dense cart row (~36px): name, qty stepper, line total, remove. */
export function CartLineItem({
  line,
  onIncrement,
  onDecrement,
  onRemove,
  onSetQty,
}: {
  line: LineDisplay;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  /** When given, the quantity is typed in directly (0 removes the line). */
  onSetQty?: (qty: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(null), [line.qty]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const n = Number.parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(n) && n !== line.qty && n >= 0) onSetQty?.(n);
  };
  const lineTotal = line.qty * line.unitPrice;
  const editable = line.editable !== false;
  const detail = [line.extras, line.meta].filter(Boolean).join(" · ");

  return (
    <li
      className={cn(
        "flex h-9 items-center gap-1.5 border-b border-[var(--color-border)] px-2 last:border-b-0",
      )}
      title={`${line.name} — ${money(line.unitPrice)}${line.unit ? ` / ${line.unit}` : ""}${detail ? ` (${detail})` : ""}`}
    >
      <p className="min-w-0 flex-1 truncate text-sm leading-none">
        {line.name}
        {detail ? (
          <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">{detail}</span>
        ) : null}
      </p>

      {editable && onIncrement && onDecrement ? (
        <div className="flex shrink-0 items-center">
          <button type="button" className={iconButton} onClick={onDecrement} aria-label="Decrease quantity">
            <Minus className="size-3.5" />
          </button>
          {onSetQty ? (
            <input
              inputMode="decimal"
              aria-label={`Quantity of ${line.name}`}
              value={draft ?? String(line.qty)}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  cancelled.current = true;
                  e.currentTarget.blur();
                }
              }}
              className="h-7 w-10 rounded-[var(--radius-lg)] border border-transparent bg-transparent px-0 text-center text-sm font-semibold tabular-nums outline-none hover:border-[var(--color-border)] focus:border-[var(--color-primary)]"
            />
          ) : (
            <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
          )}
          <button type="button" className={iconButton} onClick={onIncrement} aria-label="Increase quantity">
            <Plus className="size-3.5" />
          </button>
        </div>
      ) : (
        <span className="shrink-0 text-sm tabular-nums text-[var(--color-muted-foreground)]">
          ×{line.qty}
        </span>
      )}

      <span className="w-[4.75rem] shrink-0 text-right text-sm font-semibold tabular-nums">
        {money(lineTotal)}
      </span>

      {editable && onRemove ? (
        <button type="button" className={iconButton} onClick={onRemove} aria-label={`Remove ${line.name}`}>
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
