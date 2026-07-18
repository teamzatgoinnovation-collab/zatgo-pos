import { cn } from "@zatgo/ui";

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
          className={cn(
            "shrink-0 rounded-[var(--radius-lg)] px-3.5 py-2 text-xs capitalize transition-colors",
            value === c
              ? "bg-[var(--pos-sidebar-active)] font-semibold text-[var(--color-foreground)]"
              : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {c === "all" ? "All" : c}
        </button>
      ))}
    </div>
  );
}
