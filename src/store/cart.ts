import { create } from "zustand";
import type {
  CheckoutMeta,
  CustomerRecord,
  DeliveryInfo,
  OrderChannel,
  ProductRecord,
  SelectedExtra,
} from "@/lib/pos-repo";
import { extrasKey, lineUnitPrice, sameExtras } from "@/lib/extras";

export type PaymentMethod = "cash" | "card" | "wallet";
export type DiscountType = "none" | "percent" | "fixed";
export type SaleType = "counter" | "dine_in" | "delivery";

export type CartLine = {
  lineId: string;
  product: ProductRecord;
  qty: number;
  extras: SelectedExtra[];
};

export type CartInvoiceMeta = {
  saleType: SaleType;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  tableId: string | null;
  tableName: string;
  covers: number;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryNotes: string;
  deliveryBoyId: string | null;
  deliveryBoyName: string;
};

export type HeldSale = {
  id: string;
  label: string;
  heldAt: string;
  lines: CartLine[];
  method: PaymentMethod;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  cashTendered: string;
  invoice: CartInvoiceMeta;
};

export type CartPricing = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  itemCount: number;
};

const DEFAULT_TAX_RATE = 0.1;

export const emptyInvoiceMeta = (): CartInvoiceMeta => ({
  saleType: "counter",
  customerId: null,
  customerName: "",
  customerPhone: "",
  tableId: null,
  tableName: "",
  covers: 1,
  deliveryAddress: "",
  deliveryPhone: "",
  deliveryNotes: "",
  deliveryBoyId: null,
  deliveryBoyName: "",
});

function newLineId() {
  return `cl_${Math.random().toString(36).slice(2, 10)}`;
}

function saleTypeToChannel(saleType: SaleType): OrderChannel {
  if (saleType === "dine_in") return "dine_in";
  if (saleType === "delivery") return "delivery";
  return "counter";
}

export function invoiceMetaToCheckout(meta: CartInvoiceMeta): CheckoutMeta {
  const channel = saleTypeToChannel(meta.saleType);
  const delivery: DeliveryInfo | null =
    channel === "delivery"
      ? {
          address: meta.deliveryAddress.trim(),
          phone: meta.deliveryPhone.trim() || meta.customerPhone.trim(),
          notes: meta.deliveryNotes.trim() || undefined,
          deliveryBoyId: meta.deliveryBoyId,
          deliveryBoyName: meta.deliveryBoyName.trim() || null,
        }
      : null;

  return {
    channel,
    tableId: channel === "dine_in" ? meta.tableId : null,
    tableName: channel === "dine_in" ? meta.tableName || null : null,
    covers: channel === "dine_in" ? meta.covers : 1,
    customerId: meta.customerId,
    customerName: meta.customerName.trim() || null,
    customerPhone: meta.customerPhone.trim() || null,
    delivery,
  };
}

export function validateInvoiceMeta(meta: CartInvoiceMeta): string | null {
  if (meta.saleType === "dine_in" && !meta.tableId) {
    return "Select a table for this invoice";
  }
  if (meta.saleType === "delivery") {
    if (!meta.deliveryAddress.trim()) return "Enter a delivery address";
    if (!meta.deliveryPhone.trim() && !meta.customerPhone.trim()) {
      return "Enter a delivery phone number";
    }
    if (!meta.deliveryBoyId) return "Assign a delivery boy";
  }
  return null;
}

type CartState = {
  lines: CartLine[];
  method: PaymentMethod;
  cashTendered: string;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  invoice: CartInvoiceMeta;
  held: HeldSale[];
  add: (product: ProductRecord, extras?: SelectedExtra[], qty?: number) => void;
  setQty: (lineId: string, qty: number) => void;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  setMethod: (method: PaymentMethod) => void;
  setCashTendered: (value: string) => void;
  setDiscount: (type: DiscountType, value: number) => void;
  setTaxRate: (rate: number) => void;
  setSaleType: (saleType: SaleType) => void;
  setCustomer: (customer: CustomerRecord | null) => void;
  setCustomerFields: (fields: Partial<Pick<CartInvoiceMeta, "customerName" | "customerPhone">>) => void;
  setTable: (table: { id: string; name: string; seats?: number } | null) => void;
  setCovers: (covers: number) => void;
  setDelivery: (
    fields: Partial<
      Pick<
        CartInvoiceMeta,
        | "deliveryAddress"
        | "deliveryPhone"
        | "deliveryNotes"
        | "deliveryBoyId"
        | "deliveryBoyName"
      >
    >,
  ) => void;
  setInvoice: (invoice: CartInvoiceMeta) => void;
  qtyOf: (productId: string) => number;
  hold: (label?: string) => HeldSale | null;
  resume: (heldId: string) => void;
  discardHeld: (heldId: string) => void;
};

export function cartLineUnitPrice(line: CartLine) {
  return lineUnitPrice(line.product.price, line.extras);
}

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.qty * cartLineUnitPrice(l), 0);
}

export function cartItemCount(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function discountAmount(subtotal: number, type: DiscountType, value: number) {
  if (type === "none" || value <= 0 || subtotal <= 0) return 0;
  if (type === "percent") return Math.min(subtotal, (subtotal * value) / 100);
  return Math.min(subtotal, value);
}

export function cartPricing(
  lines: CartLine[],
  discountType: DiscountType,
  discountValue: number,
  taxRate: number,
): CartPricing {
  const subtotal = cartSubtotal(lines);
  const discount = discountAmount(subtotal, discountType, discountValue);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * Math.max(0, taxRate);
  return {
    subtotal,
    discount,
    taxable,
    tax,
    total: taxable + tax,
    itemCount: cartItemCount(lines),
  };
}

function cloneLine(line: CartLine): CartLine {
  return {
    lineId: line.lineId,
    product: line.product,
    qty: line.qty,
    extras: line.extras.map((e) => ({ ...e })),
  };
}

function cloneInvoice(invoice: CartInvoiceMeta): CartInvoiceMeta {
  return { ...invoice };
}

function snapshotActive(state: CartState): Omit<HeldSale, "id" | "label" | "heldAt"> {
  return {
    lines: state.lines.map(cloneLine),
    method: state.method,
    discountType: state.discountType,
    discountValue: state.discountValue,
    taxRate: state.taxRate,
    cashTendered: state.cashTendered,
    invoice: cloneInvoice(state.invoice),
  };
}

const emptyActive = {
  lines: [] as CartLine[],
  cashTendered: "",
  discountType: "none" as DiscountType,
  discountValue: 0,
  invoice: emptyInvoiceMeta(),
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  method: "cash",
  cashTendered: "",
  discountType: "none",
  discountValue: 0,
  taxRate: DEFAULT_TAX_RATE,
  invoice: emptyInvoiceMeta(),
  held: [],
  add: (product, extras = [], qty = 1) => {
    const normalized = [...extras].sort((a, b) => a.id.localeCompare(b.id));
    set((state) => {
      const hit = state.lines.find(
        (l) => l.product.id === product.id && sameExtras(l.extras, normalized),
      );
      if (hit) {
        return {
          lines: state.lines.map((l) =>
            l.lineId === hit.lineId ? { ...l, qty: l.qty + qty } : l,
          ),
        };
      }
      return {
        lines: [
          ...state.lines,
          {
            lineId: newLineId(),
            product,
            qty,
            extras: normalized,
          },
        ],
      };
    });
  },
  setQty: (lineId, qty) => {
    if (qty <= 0) {
      get().remove(lineId);
      return;
    }
    set((state) => ({
      lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    }));
  },
  increment: (lineId) => {
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, qty: l.qty + 1 } : l,
      ),
    }));
  },
  decrement: (lineId) => {
    set((state) => ({
      lines: state.lines
        .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    }));
  },
  remove: (lineId) => {
    set((state) => ({
      lines: state.lines.filter((l) => l.lineId !== lineId),
    }));
  },
  clear: () => set({ ...emptyActive, invoice: emptyInvoiceMeta() }),
  setMethod: (method) => set({ method }),
  setCashTendered: (cashTendered) => set({ cashTendered }),
  setDiscount: (discountType, discountValue) =>
    set({
      discountType,
      discountValue: Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0,
    }),
  setTaxRate: (taxRate) => set({ taxRate: Math.max(0, taxRate) }),
  setSaleType: (saleType) =>
    set((state) => ({
      invoice: {
        ...state.invoice,
        saleType,
        ...(saleType !== "dine_in"
          ? { tableId: null, tableName: "", covers: 1 }
          : {}),
        ...(saleType !== "delivery"
          ? {
              deliveryAddress: "",
              deliveryPhone: "",
              deliveryNotes: "",
              deliveryBoyId: null,
              deliveryBoyName: "",
            }
          : {}),
      },
    })),
  setCustomer: (customer) =>
    set((state) => ({
      invoice: {
        ...state.invoice,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? "",
        customerPhone: customer?.phone ?? "",
        deliveryAddress:
          state.invoice.saleType === "delivery" && customer?.address
            ? customer.address
            : state.invoice.deliveryAddress,
        deliveryPhone:
          state.invoice.saleType === "delivery" && customer?.phone
            ? customer.phone
            : state.invoice.deliveryPhone,
      },
    })),
  setCustomerFields: (fields) =>
    set((state) => ({
      invoice: {
        ...state.invoice,
        ...fields,
        customerId: fields.customerName !== undefined ? null : state.invoice.customerId,
      },
    })),
  setTable: (table) =>
    set((state) => ({
      invoice: {
        ...state.invoice,
        saleType: table ? "dine_in" : state.invoice.saleType,
        tableId: table?.id ?? null,
        tableName: table?.name ?? "",
        covers: table ? Math.min(state.invoice.covers || 1, table.seats ?? 12) : 1,
      },
    })),
  setCovers: (covers) =>
    set((state) => ({
      invoice: { ...state.invoice, covers: Math.max(1, covers) },
    })),
  setDelivery: (fields) =>
    set((state) => ({
      invoice: { ...state.invoice, ...fields },
    })),
  setInvoice: (invoice) => set({ invoice: cloneInvoice(invoice) }),
  qtyOf: (productId) =>
    get()
      .lines.filter((l) => l.product.id === productId)
      .reduce((n, l) => n + l.qty, 0),
  hold: (label) => {
    const state = get();
    if (state.lines.length === 0) return null;
    const sale: HeldSale = {
      id: `hold_${Date.now().toString(36)}`,
      label: label?.trim() || `Hold #${state.held.length + 1}`,
      heldAt: new Date().toISOString(),
      ...snapshotActive(state),
    };
    set({ held: [sale, ...state.held], ...emptyActive, invoice: emptyInvoiceMeta() });
    return sale;
  },
  resume: (heldId) => {
    const state = get();
    const sale = state.held.find((h) => h.id === heldId);
    if (!sale) return;

    let held = state.held.filter((h) => h.id !== heldId);
    if (state.lines.length > 0) {
      const parked: HeldSale = {
        id: `hold_${Date.now().toString(36)}`,
        label: `Hold #${held.length + 1}`,
        heldAt: new Date().toISOString(),
        ...snapshotActive(state),
      };
      held = [parked, ...held];
    }

    set({
      held,
      lines: sale.lines.map(cloneLine),
      method: sale.method,
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      taxRate: sale.taxRate,
      cashTendered: sale.cashTendered,
      invoice: cloneInvoice(sale.invoice ?? emptyInvoiceMeta()),
    });
  },
  discardHeld: (heldId) => {
    set((state) => ({ held: state.held.filter((h) => h.id !== heldId) }));
  },
}));

/** @deprecated — prefer lineId; kept for debugging */
export function cartLineKey(line: CartLine) {
  return `${line.product.id}:${extrasKey(line.extras)}`;
}
