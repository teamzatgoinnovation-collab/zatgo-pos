import { ZatGoApi } from "@zatgo/erpnext";
import type { VerticalId } from "@/lib/verticals";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import type {
  CheckoutMeta,
  CustomerRecord,
  DeliveryBoyRecord,
  InventoryRecord,
  KdsTicket,
  KitchenStation,
  OrderItem,
  OrderRecord,
  PaymentRecord,
  ProductRecord,
  SelectedExtra,
  TableRecord,
  TableStatus,
} from "@/lib/pos-models";
import type { PaymentMethod } from "@/store/cart";
import { lineUnitPrice } from "@/lib/extras";

export type * from "@/lib/pos-models";

const NOT_READY = "ERPNext domain methods are not available yet for this action.";

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

function isAvailable(value: unknown): boolean {
  if (value === false || value === 0 || value === "0") return false;
  if (value === true || value === 1 || value === "1") return true;
  return value !== false && value != null;
}

const STATIONS: KitchenStation[] = ["grill", "cold", "bar", "dessert", "counter"];

function parseStation(value: unknown): KitchenStation {
  const s = String(value ?? "counter").toLowerCase();
  return (STATIONS.includes(s as KitchenStation) ? s : "counter") as KitchenStation;
}

function parseTicketStatus(value: unknown): OrderItem["status"] {
  const s = String(value ?? "queued").toLowerCase();
  if (s === "preparing" || s === "ready" || s === "served" || s === "queued") {
    return s;
  }
  return "queued";
}

function mapProduct(row: Record<string, unknown>): ProductRecord {
  return {
    id: String(row.id ?? row.name ?? ""),
    name: String(row.item_name ?? row.itemName ?? row.name ?? "Item"),
    category: String(row.category ?? row.item_group ?? "General"),
    price: Number(row.price ?? row.rate ?? 0),
    station: parseStation(row.station),
    available: isAvailable(row.available ?? 1),
    sku: String(row.sku ?? row.item_code ?? row.id ?? row.name ?? ""),
    barcode: String(row.barcode ?? ""),
    verticals: Array.isArray(row.verticals)
      ? (row.verticals as ProductRecord["verticals"])
      : [],
    extras: Array.isArray(row.extras) ? (row.extras as ProductRecord["extras"]) : undefined,
  };
}

function mapKdsTicket(row: Record<string, unknown>): KdsTicket {
  const extrasRaw = row.extras;
  let extras: SelectedExtra[] | undefined;
  if (Array.isArray(extrasRaw)) {
    extras = extrasRaw
      .map((e) => {
        if (e && typeof e === "object") {
          const o = e as Record<string, unknown>;
          return {
            id: String(o.id ?? o.name ?? ""),
            name: String(o.name ?? o.id ?? ""),
            price: Number(o.price ?? 0),
          };
        }
        const name = String(e ?? "").trim();
        return name ? { id: name, name, price: 0 } : null;
      })
      .filter((e): e is SelectedExtra => Boolean(e?.name));
  }

  return {
    id: String(row.id ?? row.name ?? ""),
    orderId: String(row.orderId ?? row.order_number ?? row.id ?? row.name ?? ""),
    orderNumber: String(row.orderNumber ?? row.order_number ?? ""),
    tableName: String(row.tableName ?? row.table_name ?? ""),
    name: String(
      row.itemName ?? row.item_name ?? row.title ?? row.name ?? "Item",
    ),
    qty: Number(row.qty ?? 1) || 1,
    station: parseStation(row.station),
    status: parseTicketStatus(row.status),
    openedAt: String(row.openedAt ?? row.opened_at ?? ""),
    extras: extras?.length ? extras : undefined,
    server: String(row.server ?? ""),
    note: row.note ? String(row.note) : undefined,
  };
}

function mapDeliveryBoy(row: Record<string, unknown>): DeliveryBoyRecord {
  const points = Number(row.points ?? 0) || 0;
  return {
    id: String(row.id ?? row.name ?? row.code ?? ""),
    name: String(row.full_name ?? row.name ?? "Delivery boy"),
    code: row.code ? String(row.code) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    status: row.status ? String(row.status) : undefined,
    vehicle: row.vehicle ? String(row.vehicle) : undefined,
    user: row.user ? String(row.user) : undefined,
    username: row.username
      ? String(row.username)
      : row.user
        ? String(row.user)
        : undefined,
    points,
    deliveriesDone: Number(row.deliveries_done ?? row.deliveriesDone ?? 0) || 0,
    bonus: Number(row.bonus ?? Math.floor(points / 50)) || 0,
  };
}

function boyStatusRank(status?: string): number {
  const s = (status || "").toLowerCase();
  if (s === "available") return 0;
  if (s === "on route") return 1;
  if (s === "off duty") return 3;
  return 2;
}

function notReady<T>(): Promise<T> {
  return Promise.reject(new Error(NOT_READY));
}

function nextOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  return `POS-${stamp}`;
}

export type PosCounts = {
  freeTables: number;
  occupiedTables: number;
  openOrders: number;
  kdsTickets: number;
  catalogItems: number;
  lowStock: number;
  todaySales: number;
  products: number;
  tablesOccupied: number;
  kdsQueued: number;
  paymentsToday: number;
  revenueToday: number;
};

/**
 * ERPNext / zatgo_core POS repository.
 * Live methods call Frappe whitelists; unavailable domains reject (no local seed).
 */
export const posRepo = {
  orderTotal(order: OrderRecord) {
    return order.items.reduce((n, i) => n + i.qty * i.price, 0);
  },

  async counts(_verticalId?: VerticalId): Promise<PosCounts> {
    const env = await callZatGoApi<{
      items?: number;
      kds_open?: number;
    }>(ZatGoApi.restoPos.status);
    const items = Number(env.data?.items ?? env.meta?.items ?? 0);
    const kdsOpen = Number(env.data?.kds_open ?? env.meta?.kds_open ?? 0);
    return {
      freeTables: 0,
      occupiedTables: 0,
      openOrders: 0,
      kdsTickets: kdsOpen,
      catalogItems: items,
      lowStock: 0,
      todaySales: 0,
      products: items,
      tablesOccupied: 0,
      kdsQueued: kdsOpen,
      paymentsToday: 0,
      revenueToday: 0,
    };
  },

  async listProducts(_verticalId?: VerticalId): Promise<ProductRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.catalogList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data).map(mapProduct).filter((p) => p.id);
  },

  async listMenu(verticalId?: VerticalId): Promise<ProductRecord[]> {
    return this.listProducts(verticalId);
  },

  async listOrders(): Promise<OrderRecord[]> {
    return [];
  },

  async getOrder(_id: string): Promise<OrderRecord> {
    return notReady();
  },

  async listTables(): Promise<TableRecord[]> {
    return [];
  },

  async listCustomers(): Promise<CustomerRecord[]> {
    return [];
  },

  async listDeliveryBoys(opts?: {
    includeOffDuty?: boolean;
  }): Promise<DeliveryBoyRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.delivery.boysList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data)
      .map(mapDeliveryBoy)
      .filter((b) => b.id)
      .filter(
        (b) =>
          opts?.includeOffDuty ||
          !b.status ||
          b.status.toLowerCase() !== "off duty",
      )
      .sort((a, b) => {
        const rank = boyStatusRank(a.status) - boyStatusRank(b.status);
        if (rank !== 0) return rank;
        return a.name.localeCompare(b.name);
      });
  },

  /**
   * Create `ZG Delivery Boy` + ERPNext User (role Delivery) with username/password.
   * Method: zatgo_core.api.v1.delivery.boys.create
   */
  async createDeliveryBoy(input: {
    fullName: string;
    username: string;
    password: string;
    code?: string;
    phone?: string;
    email?: string;
  }): Promise<DeliveryBoyRecord> {
    const fullName = input.fullName.trim();
    const username = input.username.trim();
    const password = input.password;
    if (!fullName) throw new Error("Full name is required");
    if (!username) throw new Error("Username is required");
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.delivery.boysCreate,
      {
        full_name: fullName,
        username,
        password,
        code: input.code?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
      },
    );
    const boy = mapDeliveryBoy(env.data ?? {});
    if (!boy.id) throw new Error("Could not create delivery boy in ERPNext");
    return boy;
  },

  async listKdsTickets(): Promise<KdsTicket[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.kdsTicketsList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data)
      .map(mapKdsTicket)
      .filter((t) => t.id && t.status !== "served");
  },

  async listPayments(): Promise<PaymentRecord[]> {
    return [];
  },

  async listInventory(_verticalId?: VerticalId): Promise<InventoryRecord[]> {
    return [];
  },

  async findByBarcode(code: string, verticalId?: VerticalId): Promise<ProductRecord | null> {
    const products = await this.listProducts(verticalId);
    return products.find((p) => p.barcode === code) ?? null;
  },

  async upsertMenuItem(
    _input: Partial<ProductRecord> & { name: string; price: number },
  ): Promise<ProductRecord> {
    return notReady();
  },

  async deleteMenuItem(_id: string): Promise<void> {
    return notReady();
  },

  async upsertInventory(
    _input: Partial<InventoryRecord> & { name: string },
  ): Promise<InventoryRecord> {
    return notReady();
  },

  async upsertCustomer(
    _input: Partial<CustomerRecord> & { name: string },
  ): Promise<CustomerRecord> {
    return notReady();
  },

  async sendOrder(_orderId: string): Promise<OrderRecord> {
    return notReady();
  },

  async voidOrder(_orderId: string): Promise<OrderRecord> {
    return notReady();
  },

  async setOrderNote(_orderId: string, _note: string): Promise<OrderRecord> {
    return notReady();
  },

  async giveToDelivery(_orderId: string): Promise<OrderRecord> {
    return notReady();
  },

  async advanceKdsItem(itemId: string): Promise<KdsTicket> {
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.restoPos.kdsTicketsAdvance,
      { name: itemId },
    );
    return mapKdsTicket(env.data ?? {});
  },

  async recallKdsItem(itemId: string): Promise<KdsTicket> {
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.restoPos.kdsTicketsRecall,
      { name: itemId },
    );
    return mapKdsTicket(env.data ?? {});
  },

  async bumpStationReady(station: KitchenStation): Promise<{ count: number }> {
    const env = await callZatGoApi<{ count?: number }>(
      ZatGoApi.restoPos.kdsTicketsBumpStation,
      { station },
    );
    return { count: Number(env.data?.count ?? 0) };
  },

  async seatTable(_tableId: string, _covers: number): Promise<OrderRecord> {
    return notReady();
  },

  async setTableStatus(_tableId: string, _status: TableStatus): Promise<TableRecord> {
    return notReady();
  },

  async markBilling(_orderId: string): Promise<OrderRecord> {
    return notReady();
  },

  async payOrder(
    _orderId: string,
    _method: PaymentRecord["method"],
  ): Promise<{ payment: PaymentRecord; order: OrderRecord }> {
    return notReady();
  },

  async addItemToOrder(
    _orderId: string,
    _menuItemId: string,
    _qty: number,
    _extras?: SelectedExtra[],
  ): Promise<OrderRecord> {
    return notReady();
  },

  async updateOrderItemQty(
    _orderId: string,
    _itemId: string,
    _qty: number,
  ): Promise<OrderRecord> {
    return notReady();
  },

  async createOrderFromCart(
    _meta: CheckoutMeta,
    _items: unknown[],
  ): Promise<OrderRecord> {
    return notReady();
  },

  async checkoutWalkIn(
    lines: {
      productId: string;
      name?: string;
      price?: number;
      station?: KitchenStation;
      qty: number;
      extras: SelectedExtra[];
    }[],
    method: PaymentMethod,
    _verticalId: VerticalId,
    pricing: { amount: number; discount: number; tax: number },
    meta: CheckoutMeta,
  ): Promise<{ order: OrderRecord; payment: PaymentRecord }> {
    if (!lines.length) {
      return Promise.reject(new Error("Cart is empty"));
    }

    const orderNumber = nextOrderNumber();
    const orderId = `ord_${Date.now().toString(36)}`;
    const paidAt = new Date().toISOString();
    const isDelivery = meta.channel === "delivery";

    const order: OrderRecord = {
      id: orderId,
      number: orderNumber,
      tableId: meta.tableId ?? null,
      tableName: meta.tableName ?? "",
      covers: meta.covers ?? 1,
      status: "paid",
      items: lines.map((l, idx) => ({
        id: `oi_${idx}_${l.productId}`,
        name: l.name || l.productId,
        qty: l.qty,
        price:
          l.price ??
          lineUnitPrice(0, l.extras),
        station: l.station || "counter",
        status: "served",
        extras: l.extras,
      })),
      openedAt: paidAt,
      server: "POS",
      channel: meta.channel,
      customerId: meta.customerId,
      customerName: meta.customerName,
      customerPhone: meta.customerPhone,
      delivery: meta.delivery ?? null,
      deliveryStatus: isDelivery ? "handed_off" : null,
    };

    const payment: PaymentRecord = {
      id: `pay_${Date.now().toString(36)}`,
      orderId,
      orderNumber,
      method,
      amount: pricing.amount,
      paidAt,
      channel: meta.channel,
    };

    if (isDelivery) {
      const boyId = meta.delivery?.deliveryBoyId?.trim();
      if (!boyId) {
        return Promise.reject(new Error("Assign a delivery boy"));
      }
      const itemsSummary = order.items
        .map((i) => `${i.qty}× ${i.name}`)
        .join(", ")
        .slice(0, 140);
      const notes = meta.delivery?.notes?.trim();
      await callZatGoApi(ZatGoApi.delivery.stopsCreate, {
        title: `POS ${orderNumber}`,
        order_number: orderNumber,
        invoice_number: orderNumber,
        customer: meta.customerName || "Walk-in",
        address: meta.delivery?.address || "",
        phone: meta.delivery?.phone || meta.customerPhone || "",
        window_label: "ASAP",
        items_summary: notes ? `${itemsSummary} · ${notes}` : itemsSummary,
        delivery_boy: boyId,
        status: "Assigned",
        remarks: notes || undefined,
        payment_method:
          method === "cash"
            ? "COD"
            : method === "card"
              ? "Card"
              : method === "wallet"
                ? "Wallet"
                : undefined,
        cod_amount: method === "cash" ? pricing.amount : 0,
        paid_amount: method === "cash" ? 0 : pricing.amount,
        delivery_charges: 0,
      });
    }

    return { order, payment };
  },
};
