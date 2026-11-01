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
  onSetPrice,
  priceEdited,
}: {
  line: LineDisplay;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  /** When given, the quantity is typed in directly (0 removes the line). */
  onSetQty?: (qty: number) => void;
  /** When given, the unit price is typed in directly (empty or Esc puts the list price back). */
  onSetPrice?: (price: number | null) => void;
  priceEdited?: boolean;
}) {
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  const priceCancelled = useRef(false);
  useEffect(() => setPriceDraft(null), [line.unitPrice]);
  const commitPrice = () => {
    if (priceCancelled.current) {
      priceCancelled.current = false;
      setPriceDraft(null);
      return;
    }
    if (priceDraft === null) return;
    const text = priceDraft.trim();
    setPriceDraft(null);
    if (text === "") return onSetPrice?.(null);
    const n = Number.parseFloat(text);
    if (Number.isFinite(n) && n >= 0 && n !== line.unitPrice) onSetPrice?.(n);
  };
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

      {!(editable && onSetPrice) ? (
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]" title="Unit price">
          {line.unitPrice.toFixed(2)}
        </span>
      ) : null}

      {editable && onSetPrice ? (
        <input
          inputMode="decimal"
          aria-label={`Unit price of ${line.name}`}
          title={priceEdited ? "Price changed — clear it to go back to the list price" : "Unit price"}
          value={priceDraft ?? line.unitPrice.toFixed(2)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setPriceDraft(e.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={commitPrice}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              priceCancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "h-7 w-[3.75rem] shrink-0 rounded-[var(--radius-lg)] border bg-transparent px-1 text-right text-xs tabular-nums outline-none focus:border-[var(--color-primary)]",
            priceEdited ? "border-[var(--color-warning)] font-semibold" : "border-transparent hover:border-[var(--color-border)]",
          )}
        />
      ) : null}

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
