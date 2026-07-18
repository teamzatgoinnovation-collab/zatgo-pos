import { cn } from "@zatgo/ui";
import { Banknote, CreditCard, Wallet } from "@zatgo/icons";
import type { PaymentMethod } from "@/store/cart";

const OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "wallet", label: "Wallet", icon: Wallet },
];

export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-[var(--radius-lg)] border px-2 py-2.5 text-xs font-medium transition-colors",
            value === option
              ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)] text-[var(--color-foreground)]"
              : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
