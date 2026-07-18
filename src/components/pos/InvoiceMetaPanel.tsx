import { Button, cn } from "@zatgo/ui";
import { MapPin, Table2, Truck, User } from "@zatgo/icons";
import type { CartInvoiceMeta, SaleType } from "@/store/cart";

export function InvoiceMetaPanel({
  invoice,
  showTable,
  onSaleType,
  onOpenDetails,
}: {
  invoice: CartInvoiceMeta;
  showTable: boolean;
  onSaleType: (type: SaleType) => void;
  onOpenDetails: () => void;
}) {
  const types: { id: SaleType; label: string; hide?: boolean }[] = [
    { id: "counter", label: "Counter" },
    { id: "dine_in", label: "Table", hide: !showTable },
    { id: "delivery", label: "Delivery" },
  ];

  const summary = [
    invoice.customerName
      ? `Customer: ${invoice.customerName}`
      : "Customer: Walk-in",
    invoice.saleType === "dine_in"
      ? invoice.tableName
        ? `Table: ${invoice.tableName}`
        : "Table: not set"
      : null,
    invoice.saleType === "delivery"
      ? [
          invoice.deliveryAddress
            ? `Ship: ${invoice.deliveryAddress}`
            : "Delivery: address needed",
          invoice.deliveryBoyName
            ? `Boy: ${invoice.deliveryBoyName}`
            : "Boy: not assigned",
        ].join(" · ")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {types
          .filter((t) => !t.hide)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSaleType(t.id)}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1 rounded-[var(--radius-lg)] border text-xs font-medium transition-colors",
                invoice.saleType === t.id
                  ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)]"
                  : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
              )}
            >
              {t.id === "delivery" ? (
                <Truck className="size-3" />
              ) : t.id === "dine_in" ? (
                <Table2 className="size-3" />
              ) : (
                <User className="size-3" />
              )}
              {t.label}
            </button>
          ))}
      </div>

      <button
        type="button"
        onClick={onOpenDetails}
        className="flex w-full items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-muted)]"
      >
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="min-w-0">
          <span className="block font-medium text-[var(--color-foreground)]">
            Invoice details
          </span>
          <span className="block truncate text-[var(--color-muted-foreground)]">
            {summary}
          </span>
        </span>
        <Button variant="ghost" className="ml-auto h-7 shrink-0 px-2 text-xs" tabIndex={-1}>
          Edit
        </Button>
      </button>
    </div>
  );
}
