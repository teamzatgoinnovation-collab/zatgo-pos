import { cn } from "@zatgo/ui";
import { Banknote, CreditCard, Wallet } from "@zatgo/icons";
import type { PaymentMethod } from "@/store/cart";
import { useConnectivity } from "@/lib/offline/connectivity";
import { usePosSettings } from "@/lib/offline/settings";

const OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
  hue: number;
}[] = [
  { value: "cash", label: "Cash", icon: Banknote, hue: 165 },
  { value: "card", label: "Card", icon: CreditCard, hue: 250 },
  { value: "wallet", label: "Wallet", icon: Wallet, hue: 320 },
];

export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  const offline = useConnectivity((s) => s.net !== "online");
  const allowCard = usePosSettings((s) => s.settings.offline.allowCardOffline);
  return (
    <div className="grid grid-cols-3 gap-1">
      {OPTIONS.map(({ value: option, label, icon: Icon, hue }) => {
        const blocked = offline && option !== "cash" && !allowCard;
        return (
        <button
          key={option}
          type="button"
          disabled={blocked}
          title={blocked ? "Needs a connection" : undefined}
          onClick={() => onChange(option)}
          style={{ "--hue": hue } as React.CSSProperties}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            value === option
              ? "pos-pay-on border-transparent font-semibold shadow-sm"
              : "pos-pay border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
        );
      })}
    </div>
  );
}
