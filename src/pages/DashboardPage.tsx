import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { posRepo } from "@/lib/pos-repo";
import { effectiveHasFeature } from "@/lib/modules";
import { isRetailSite, siteAllows } from "@/lib/site-features";
import { useSiteStore } from "@/store/site";
import type { PosFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";
import { PageHeader } from "@zatgo/ui";
import { money } from "@/lib/money";

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
    | "todaySales"
    | "itemsSoldToday";
  format?: "money";
  /** Only meaningful in supermarket mode (the restaurant dashboard has no such count). */
  retailOnly?: boolean;
};

const allCards: Card[] = [
  { key: "free", label: "Free tables", to: "/floor", feature: "floor", valueKey: "freeTables" },
  { key: "occ", label: "Occupied", to: "/floor", feature: "floor", valueKey: "occupiedTables" },
  { key: "orders", label: "Open orders", to: "/orders", feature: "orders", valueKey: "openOrders" },
  { key: "kds", label: "KDS tickets", to: "/kds", feature: "kds", valueKey: "kdsTickets" },
  { key: "catalog", label: "Catalog items", to: "/menu", feature: "catalog", valueKey: "catalogItems" },
  { key: "stock", label: "Low stock", to: "/inventory", feature: "inventory", valueKey: "lowStock" },
  { key: "sales", label: "Today sales", to: "/reports", feature: "reports", valueKey: "todaySales", format: "money" },
  { key: "sold", label: "Items sold today", to: "/reports", feature: "reports", valueKey: "itemsSoldToday", retailOnly: true },
];

export function DashboardPage() {
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  const site = useSiteStore((s) => s.profile);
  const verticalId = useBusinessStore((s) => s.verticalId);
  const { data } = useQuery({
    queryKey: ["pos", "counts", verticalId],
    queryFn: () => posRepo.counts(verticalId),
  });

  const retail = isRetailSite(site);
  // Tables / open orders / KDS tiles are hidden in retail by the site gate (siteAllows is false for them).
  const cards = allCards.filter(
    (c) =>
      (!c.retailOnly || retail) &&
      (!c.feature || (effectiveHasFeature(profile, c.feature, modules) && siteAllows(site, c.feature))),
  );

  return (
    <div>
      <PageHeader
        title={`${profile.shortLabel} overview`}
        description={
          retail
            ? `Today at a glance for ${profile.label}.`
            : `Modules for ${profile.label}. Toggle tables & kitchen under Setup → preferences.`
        }
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
                ? `${money(Number(raw))}`
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
