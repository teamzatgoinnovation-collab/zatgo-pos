import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { posRepo } from "@/lib/pos-repo";
import { effectiveHasFeature } from "@/lib/modules";
import type { PosFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";
import { PageHeader } from "@zatgo/ui";

type Card = {
  key: string;
  label: string;
  to: string;
  feature?: PosFeature;
  valueKey:
    | "freeTables"
    | "occupiedTables"
    | "openOrders"
    | "kdsTickets"
    | "catalogItems"
    | "lowStock"
    | "todaySales";
  format?: "money";
};

const allCards: Card[] = [
  { key: "free", label: "Free tables", to: "/floor", feature: "floor", valueKey: "freeTables" },
  { key: "occ", label: "Occupied", to: "/floor", feature: "floor", valueKey: "occupiedTables" },
  { key: "orders", label: "Open orders", to: "/orders", feature: "orders", valueKey: "openOrders" },
  { key: "kds", label: "KDS tickets", to: "/kds", feature: "kds", valueKey: "kdsTickets" },
  { key: "catalog", label: "Catalog items", to: "/menu", feature: "catalog", valueKey: "catalogItems" },
  { key: "stock", label: "Low stock", to: "/inventory", feature: "inventory", valueKey: "lowStock" },
  { key: "sales", label: "Today sales", to: "/reports", feature: "reports", valueKey: "todaySales", format: "money" },
];

export function DashboardPage() {
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  const verticalId = useBusinessStore((s) => s.verticalId);
  const { data } = useQuery({
    queryKey: ["pos", "counts", verticalId],
    queryFn: () => posRepo.counts(verticalId),
  });

  const cards = allCards.filter(
    (c) => !c.feature || effectiveHasFeature(profile, c.feature, modules),
  );

  return (
    <div>
      <PageHeader
        title={`${profile.shortLabel} overview`}
        description={`Modules for ${profile.label}. Toggle tables & kitchen under Setup → preferences.`}
      />
      {effectiveHasFeature(profile, "sell", modules) ? (
        <Link
          to="/sell"
          className="mb-4 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--pos-sidebar-active)] px-4 py-3 text-sm font-medium transition-colors hover:opacity-90"
        >
          Open POS — sell / checkout
          <span aria-hidden>→</span>
        </Link>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const raw = data?.[card.valueKey];
          const display =
            raw == null
              ? "—"
              : card.format === "money"
                ? `$${Number(raw).toFixed(2)}`
                : String(raw);
          return (
            <Link
              key={card.key}
              to={card.to}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-muted)]"
            >
              <p className="text-sm text-[var(--color-muted-foreground)]">{card.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{display}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
