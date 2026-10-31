import { cn } from "@zatgo/ui";
import { hueOf } from "@/lib/hue";

export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ "--hue": hueOf(c) } as React.CSSProperties}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs capitalize transition-colors",
            value === c
              ? "pos-brand-bg font-semibold shadow-sm"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {c === "all" ? null : <span className="pos-chip-dot size-2 rounded-full" />}
          {c === "all" ? "All" : c}
        </button>
      ))}
    </div>
  );
}
