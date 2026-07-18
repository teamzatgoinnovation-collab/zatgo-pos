import { Button, cn } from "@zatgo/ui";
import { Pause, ShoppingCart } from "@zatgo/icons";
import { AnimatePresence } from "framer-motion";
import { formatExtras } from "@/lib/extras";
import {
  cartLineUnitPrice,
  cartPricing,
  type CartInvoiceMeta,
  type CartLine,
  type DiscountType,
  type PaymentMethod,
  type SaleType,
} from "@/store/cart";
import { CartLineItem } from "./CartLineItem";
import { InvoiceMetaPanel } from "./InvoiceMetaPanel";
import { PaymentMethodPicker } from "./PaymentMethodPicker";

export function CartPanel({
  lines,
  method,
  cashTendered,
  discountType,
  discountValue,
  taxRate,
  invoice,
  showTable,
  charging,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onHold,
  onMethodChange,
  onCashTenderedChange,
  onDiscountChange,
  onTaxRateChange,
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
  charging: boolean;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onClear: () => void;
  onHold: () => void;
  onMethodChange: (method: PaymentMethod) => void;
  onCashTenderedChange: (value: string) => void;
  onDiscountChange: (type: DiscountType, value: number) => void;
  onTaxRateChange: (rate: number) => void;
  onSaleType: (type: SaleType) => void;
  onEditInvoice: () => void;
  onCharge: () => void;
}) {
  const pricing = cartPricing(lines, discountType, discountValue, taxRate);
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

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]",
        "bg-[linear-gradient(180deg,var(--pos-sidebar)_0%,var(--color-background)_42%)]",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-[var(--color-muted-foreground)]" />
          <h2 className="text-sm font-semibold">Cart</h2>
          {pricing.itemCount > 0 ? (
            <span className="rounded-full bg-[var(--pos-sidebar-active)] px-2 py-0.5 text-xs font-semibold tabular-nums">
              {pricing.itemCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
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

      <ul className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3">
        {lines.length === 0 ? (
          <li className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-muted)]">
              <ShoppingCart className="size-5 text-[var(--color-muted-foreground)]" />
            </div>
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Scan a barcode or tap a product to start the sale.
            </p>
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {lines.map((line) => (
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
              />
            ))}
          </AnimatePresence>
        )}
      </ul>

      <footer className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <InvoiceMetaPanel
          invoice={invoice}
          showTable={showTable}
          onSaleType={onSaleType}
          onOpenDetails={onEditInvoice}
        />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Discount</p>
          <div className="flex gap-1.5">
            {(
              [
                ["none", "Off"],
                ["percent", "%"],
                ["fixed", "$"],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onDiscountChange(type, type === "none" ? 0 : discountValue || 0)
                }
                className={cn(
                  "h-9 flex-1 rounded-[var(--radius-lg)] border text-xs font-medium transition-colors",
                  discountType === type
                    ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)]"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
                )}
              >
                {label}
              </button>
            ))}
            <input
              inputMode="decimal"
              disabled={discountType === "none"}
              value={discountInput}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onDiscountChange(discountType, 0);
                  return;
                }
                const n = Number.parseFloat(raw);
                if (Number.isFinite(n)) onDiscountChange(discountType, n);
              }}
              placeholder="0"
              className="h-9 w-16 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-2 text-sm tabular-nums outline-none focus:border-[var(--color-primary)] disabled:opacity-40"
            />
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-xs font-medium text-[var(--color-muted-foreground)]">
          <span>Tax {(taxRate * 100).toFixed(0)}%</span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={Math.round(taxRate * 100)}
            onChange={(e) => onTaxRateChange(Number(e.target.value) / 100)}
            className="w-36 accent-[var(--color-primary)]"
          />
        </label>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between text-[var(--color-muted-foreground)]">
            <span>Subtotal</span>
            <span className="tabular-nums">${pricing.subtotal.toFixed(2)}</span>
          </div>
          {pricing.discount > 0 ? (
            <div className="flex items-center justify-between text-[var(--color-muted-foreground)]">
              <span>Discount</span>
              <span className="tabular-nums">−${pricing.discount.toFixed(2)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-[var(--color-muted-foreground)]">
            <span>Tax</span>
            <span className="tabular-nums">${pricing.tax.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span className="tabular-nums">${pricing.total.toFixed(2)}</span>
          </div>
        </div>

        <PaymentMethodPicker value={method} onChange={onMethodChange} />

        {method === "cash" && lines.length > 0 ? (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)]">
              Cash tendered
              <input
                inputMode="decimal"
                value={cashTendered}
                onChange={(e) => onCashTenderedChange(e.target.value)}
                placeholder={pricing.total.toFixed(2)}
                className="mt-1 h-10 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm tabular-nums outline-none focus:border-[var(--color-primary)]"
              />
            </label>
            {change !== null && Number.isFinite(change) ? (
              <div
                className={cn(
                  "flex items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 text-sm font-medium",
                  change >= 0
                    ? "bg-[var(--pos-floor-free)]"
                    : "bg-[var(--pos-floor-occupied)]",
                )}
              >
                <span>{change >= 0 ? "Change due" : "Short"}</span>
                <span className="tabular-nums">${Math.abs(change).toFixed(2)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button
          className="h-12 w-full text-base font-semibold"
          disabled={lines.length === 0 || charging || Boolean(cashShort)}
          onClick={onCharge}
        >
          {charging ? "Charging…" : `Invoice $${pricing.total.toFixed(2)}`}
        </Button>
      </footer>
    </aside>
  );
}
