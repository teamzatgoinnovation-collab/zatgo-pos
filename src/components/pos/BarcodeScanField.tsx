import { Button, cn } from "@zatgo/ui";
import { ScanBarcode } from "@zatgo/icons";
import { type FormEvent, type RefObject } from "react";

export function BarcodeScanField({
  value,
  onChange,
  onSubmit,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.04)]",
        className,
      )}
    >
      <ScanBarcode className="size-5 shrink-0 text-[var(--color-muted-foreground)]" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Scan barcode or type SKU / name…"
        className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
        autoComplete="off"
      />
      <Button type="submit" className="h-9 shrink-0 px-4">
        Add
      </Button>
    </form>
  );
}
