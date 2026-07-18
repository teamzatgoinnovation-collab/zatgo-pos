import { Button, cn } from "@zatgo/ui";
import {
  ClipboardList,
  CookingPot,
  FileText,
  Pause,
  Printer,
  UtensilsCrossed,
} from "@zatgo/icons";
import { useBusinessStore } from "@/store/business";
import { effectiveHasFeature } from "@/lib/modules";
import type { PosFeature } from "@/lib/verticals";

export type PosHubId = "orders" | "invoices" | "kds" | "floor" | "held" | "reprint";

type Action = {
  id: PosHubId;
  label: string;
  icon: typeof FileText;
  feature?: PosFeature;
  count?: number;
  disabled?: boolean;
};

export function PosActionBar({
  counts,
  canReprint,
  heldCount,
  active,
  onOpen,
}: {
  counts: { orders: number; invoices: number; kds: number; floor: number };
  canReprint: boolean;
  heldCount: number;
  active?: PosHubId | null;
  onOpen: (id: PosHubId) => void;
}) {
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);

  const actions: Action[] = (
    [
      {
        id: "orders",
        label: "Orders",
        icon: ClipboardList,
        feature: "orders",
        count: counts.orders,
      },
      {
        id: "invoices",
        label: "Invoices",
        icon: FileText,
        count: counts.invoices,
      },
      {
        id: "kds",
        label: "Kitchen",
        icon: CookingPot,
        feature: "kds",
        count: counts.kds,
      },
      {
        id: "floor",
        label: "Floor",
        icon: UtensilsCrossed,
        feature: "floor",
        count: counts.floor,
      },
      {
        id: "held",
        label: "Held",
        icon: Pause,
        count: heldCount,
        disabled: heldCount === 0,
      },
      {
        id: "reprint",
        label: "Reprint",
        icon: Printer,
        disabled: !canReprint,
      },
    ] satisfies Action[]
  ).filter((a) => !a.feature || effectiveHasFeature(profile, a.feature, modules));

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.id}
            variant={active === action.id ? "default" : "outline"}
            className={cn("h-9 shrink-0 gap-1.5 px-3 text-xs")}
            disabled={action.disabled}
            onClick={() => onOpen(action.id)}
          >
            <Icon className="size-3.5" />
            {action.label}
            {typeof action.count === "number" && action.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active === action.id
                    ? "bg-white/20"
                    : "bg-[var(--pos-sidebar-active)]",
                )}
              >
                {action.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
