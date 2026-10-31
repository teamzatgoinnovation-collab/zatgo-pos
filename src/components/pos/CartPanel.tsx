import { Button, cn } from "@zatgo/ui";
import { Pause, ShoppingCart } from "@zatgo/icons";
import { formatExtras } from "@/lib/extras";
import {
  cartLineUnitPrice,
  cartPricing,
  useCartStore,
  type CartInvoiceMeta,
  type CartLine,
  type DiscountType,
  type PaymentMethod,
  type SaleType,
} from "@/store/cart";
import { CartLineItem } from "./CartLineItem";
import { InvoiceMetaPanel } from "./InvoiceMetaPanel";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { money } from "@/lib/money";
import { useSiteStore } from "@/store/site";
import { usePosSettings } from "@/lib/offline/settings";

export function CartPanel({
  lines,
  method,
  cashTendered,
  discountType,
  discountValue,
  taxRate,
  invoice,
  showTable,
  showDelivery = true,
  charging,
  onIncrement,
  onDecrement,
  onRemove,
  onSetQty,
  onClear,
  onHold,
  onMethodChange,
  onCashTenderedChange,
  onDiscountChange,
  onSaleType,
  onEditInvoice,
  onCharge,
}: {
  lines: CartLine[];
  method: PaymentMethod;
  cashTendered: string;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  invoice: CartInvoiceMeta;
  showTable: boolean;
  showDelivery?: boolean;
  charging: boolean;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onSetQty: (lineId: string, qty: number) => void;
  onClear: () => void;
  onHold: () => void;
  onMethodChange: (method: PaymentMethod) => void;
  onCashTenderedChange: (value: string) => void;
  onDiscountChange: (type: DiscountType, value: number) => void;
  onSaleType: (type: SaleType) => void;
  onEditInvoice: () => void;
  onCharge: () => void;
}) {
  const pricing = cartPricing(lines, discountType, discountValue, taxRate);
  // ZG POS Settings -> Allow Cashier to Change Prices (default off); the site still refuses a price below list for users without the override role.
  const allowPriceChange = usePosSettings((s) => s.settings.counter.allowPriceChange);
  const setPrice = useCartStore((s) => s.setPrice);
  // pos_settings: discounts can be switched off or capped (% of the subtotal); the site enforces it again.
  const allowDiscounts = usePosSettings((s) => s.settings.allowDiscounts);
  const maxDiscountPercent = usePosSettings((s) => s.settings.maxDiscountPercent);
  const changeDiscount = (type: DiscountType, value: number) => {
    if (!allowDiscounts) return onDiscountChange("none", 0);
    const cap = maxDiscountPercent > 0 ? maxDiscountPercent : 100;
    const max = type === "percent" ? cap : (pricing.subtotal * cap) / 100;
    onDiscountChange(type, type === "none" ? 0 : Math.min(value, Math.max(0, max)));
  };
  const tendered = Number.parseFloat(cashTendered);
  const change =
    method === "cash" && Number.isFinite(tendered) ? tendered - pricing.total : null;
  const cashShort =
    method === "cash" &&
    lines.length > 0 &&
    cashTendered.trim() !== "" &&
    Number.isFinite(tendered) &&
    tendered < pricing.total;

  const discountInput =
    discountType === "none" ? "" : String(discountValue || "");

  const currency = useSiteStore.getState().profile?.currency ?? "$";

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]",
        "bg-[var(--color-background)]",
      )}
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-[var(--color-muted-foreground)]" />
          <h2 className="text-sm font-semibold">Cart</h2>
          {pricing.itemCount > 0 ? (
            <span className="rounded-full bg-[var(--pos-sidebar-active)] px-2 text-xs font-semibold tabular-nums">
              {pricing.itemCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs text-[var(--color-muted-foreground)]"
            disabled={lines.length === 0}
            onClick={onHold}
          >
            <Pause className="size-3.5" />
            Hold
          </Button>
          <Button
            variant="ghost"
            className="h-8 px-2 text-xs text-[var(--color-muted-foreground)]"
            disabled={lines.length === 0}
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </header>

      <ul data-cart-list className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <li className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-4 text-center">
            <ShoppingCart className="size-5 text-[var(--color-muted-foreground)]" />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Scan a barcode or tap a product to start the sale.
            </p>
          </li>
        ) : (
          lines.map((line) => (
            <CartLineItem
              key={line.lineId}
              line={{
                id: line.lineId,
                name: line.product.name,
                unitPrice: cartLineUnitPrice(line),
                qty: line.qty,
                unit: line.product.unit,
                extras: formatExtras(line.extras) || undefined,
              }}
              onIncrement={() => onIncrement(line.lineId)}
              onDecrement={() => onDecrement(line.lineId)}
              onRemove={() => onRemove(line.lineId)}
              onSetQty={(qty) => onSetQty(line.lineId, qty)}
              onSetPrice={allowPriceChange ? (price) => setPrice(line.lineId, price) : undefined}
              priceEdited={line.priceOverride !== undefined}
            />
          ))
        )}
      </ul>

      <footer
        data-cart-footer
        className="shrink-0 space-y-1.5 border-t border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      >
        <InvoiceMetaPanel
          invoice={invoice}
          showTable={showTable}
          showDelivery={showDelivery}
          onSaleType={onSaleType}
          onOpenDetails={onEditInvoice}
        />

        <div className="flex items-center gap-1">
          {(
            [
              ["none", "Off"],
              ["percent", "%"],
              ["fixed", currency],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => changeDiscount(type, type === "none" ? 0 : discountValue || 0)}
              className={cn(
                "h-7 min-w-8 rounded-[var(--radius-lg)] border px-1.5 text-xs font-medium transition-colors",
                discountType === type
                  ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)]"
                  : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
              )}
              title={type === "none" ? "No discount" : type === "percent" ? "Percent discount" : "Fixed discount"}
            >
              {label}
            </button>
          ))}
          <input
            inputMode="decimal"
            disabled={discountType === "none" || !allowDiscounts}
            value={discountInput}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                changeDiscount(discountType, 0);
                return;
              }
              const n = Number.parseFloat(raw);
              if (Number.isFinite(n)) changeDiscount(discountType, n);
            }}
            placeholder="Discount"
            aria-label="Discount value"
            className="h-7 min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-2 text-xs tabular-nums outline-none focus:border-[var(--color-primary)] disabled:opacity-40"
          />
          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
            Tax {(taxRate * 100).toFixed(taxRate * 100 % 1 ? 1 : 0)}%
          </span>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-xs tabular-nums text-[var(--color-muted-foreground)]">
            <span>Subtotal {money(pricing.subtotal)}</span>
            {pricing.discount > 0 ? <span>Discount −{money(pricing.discount)}</span> : null}
            <span>Tax {money(pricing.tax)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold leading-tight">
            <span>Total</span>
            <span className="tabular-nums">{money(pricing.total)}</span>
          </div>
        </div>

        <PaymentMethodPicker value={method} onChange={onMethodChange} />

        {method === "cash" && lines.length > 0 ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={cashTendered}
              onChange={(e) => onCashTenderedChange(e.target.value)}
              placeholder={`Tendered ${pricing.total.toFixed(2)}`}
              aria-label="Cash tendered"
              className="h-8 min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-2 text-sm tabular-nums outline-none focus:border-[var(--color-primary)]"
            />
            {change !== null && Number.isFinite(change) ? (
              <span
                className={cn(
                  "shrink-0 rounded-[var(--radius-lg)] px-2 py-1 text-xs font-medium tabular-nums",
                  change >= 0 ? "bg-[var(--pos-floor-free)]" : "bg-[var(--pos-floor-occupied)]",
                )}
              >
                {change >= 0 ? "Change" : "Short"} {money(Math.abs(change))}
              </span>
            ) : null}
          </div>
        ) : null}

        <Button
          className="h-10 w-full text-sm font-semibold"
          disabled={lines.length === 0 || charging || Boolean(cashShort)}
          onClick={onCharge}
        >
          {charging ? "Charging…" : `Checkout ${money(pricing.total)}`}
        </Button>
      </footer>
    </aside>
  );
}
