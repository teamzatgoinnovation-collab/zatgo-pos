import { ZatGoApi } from "@zatgo/erpnext";
import type { VerticalId } from "@/lib/verticals";
import { callZatGoApi } from "@/lib/call-zatgo-api";
import { clearClientId, getOrCreateClientId } from "@/lib/idempotency";
import type {
  CheckoutMeta,
  CustomerRecord,
  DeliveryInfo,
  DeliveryBoyRecord,
  InventoryRecord,
  KdsTicket,
  KitchenStation,
  OrderChannel,
  OrderItem,
  OrderRecord,
  OrderStatus,
  PaymentRecord,
  ProductRecord,
  SelectedExtra,
  TableRecord,
  TableStatus,
} from "@/lib/pos-models";
import type { PaymentMethod } from "@/store/cart";

export type * from "@/lib/pos-models";

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

/** Walk every page of a paginated zatgo-core list (the API caps page_size at 100). */
async function fetchAllRows(
  method: string,
  args: Record<string, unknown> = {},
  maxPages = 30,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const env = await callZatGoApi<unknown[]>(method, { ...args, page, page_size: 100 });
    const rows = asRows(env.data);
    out.push(...rows);
    const total = Number(env.meta?.total ?? 0);
    if (rows.length < 100 || (total && out.length >= total)) break;
  }
  return out;
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

const ORDER_STATUSES: OrderStatus[] = ["open", "sent", "ready", "paid", "void"];

function parseOrderStatus(value: unknown): OrderStatus {
  const s = String(value ?? "open").toLowerCase();
  return (ORDER_STATUSES.includes(s as OrderStatus) ? s : "open") as OrderStatus;
}

const ORDER_CHANNELS: OrderChannel[] = ["dine_in", "counter", "walk_in", "delivery"];

function parseOrderChannel(value: unknown): OrderChannel {
  const s = String(value ?? "counter").toLowerCase();
  return (ORDER_CHANNELS.includes(s as OrderChannel) ? s : "counter") as OrderChannel;
}

const TABLE_STATUSES: TableStatus[] = ["free", "occupied", "billing"];

function parseTableStatus(value: unknown): TableStatus {
  const s = String(value ?? "free").toLowerCase();
  return (TABLE_STATUSES.includes(s as TableStatus) ? s : "free") as TableStatus;
}

function mapOrderItem(row: Record<string, unknown>): OrderItem {
  const extrasRaw = row.extras;
  const extras: SelectedExtra[] = Array.isArray(extrasRaw)
    ? extrasRaw
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"))
        .map((e) => ({
          id: String(e.id ?? e.name ?? ""),
          name: String(e.name ?? e.id ?? ""),
          price: Number(e.price ?? 0),
        }))
    : [];
  return {
    id: String(row.id ?? row.name ?? ""),
    name: String(row.name ?? row.item_name ?? "Item"),
    qty: Number(row.qty ?? 1) || 1,
    price: Number(row.price ?? row.rate ?? 0),
    station: parseStation(row.station),
    status: parseTicketStatus(row.status),
    extras: extras.length ? extras : undefined,
  };
}

function mapDelivery(row: unknown): DeliveryInfo | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    address: String(r.address ?? ""),
    phone: String(r.phone ?? ""),
    notes: r.notes ? String(r.notes) : undefined,
    deliveryBoyId: (r.deliveryBoyId ?? r.delivery_boy_id ?? null) as string | null,
    deliveryBoyName: (r.deliveryBoyName ?? r.delivery_boy_name ?? null) as string | null,
  };
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: String(row.id ?? row.name ?? ""),
    number: String(row.number ?? row.order_number ?? ""),
    tableId: (row.tableId ?? row.table_id ?? row.table ?? null) as string | null,
    tableName: String(row.tableName ?? row.table_name ?? ""),
    covers: Number(row.covers ?? 1) || 1,
    status: parseOrderStatus(row.status),
    items: Array.isArray(row.items)
      ? (row.items as Record<string, unknown>[]).map(mapOrderItem)
      : [],
    openedAt: String(row.openedAt ?? row.opened_at ?? ""),
    server: String(row.server ?? ""),
    channel: parseOrderChannel(row.channel),
    note: row.note ? String(row.note) : undefined,
    customerId: (row.customerId ?? row.customer_id ?? row.customer ?? null) as string | null,
    customerName: (row.customerName ?? row.customer_name ?? null) as string | null,
    customerPhone: (row.customerPhone ?? row.customer_phone ?? null) as string | null,
    delivery: mapDelivery(row.delivery),
    deliveryStatus: (row.deliveryStatus ?? row.delivery_status ?? null) as
      | OrderRecord["deliveryStatus"]
      | null,
  };
}

function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id ?? row.name ?? ""),
    name: String(row.name ?? row.customer_name ?? ""),
    phone: row.phone ? String(row.phone) : undefined,
    email: row.email ? String(row.email) : undefined,
  };
}

function mapTable(row: Record<string, unknown>): TableRecord {
  return {
    id: String(row.id ?? row.table_code ?? row.name ?? ""),
    name: String(row.name ?? row.table_name ?? ""),
    seats: Number(row.seats ?? 0) || 0,
    zone: String(row.zone ?? ""),
    status: parseTableStatus(row.status),
    orderId: (row.orderId ?? row.order_id ?? row.current_order ?? null) as string | null,
    covers: Number(row.covers ?? 0) || 0,
  };
}

function mapPayment(row: Record<string, unknown>): PaymentRecord {
  const method = String(row.method ?? "cash").toLowerCase();
  return {
    id: String(row.id ?? ""),
    orderId: String(row.orderId ?? row.order_id ?? ""),
    orderNumber: String(row.orderNumber ?? row.order_number ?? ""),
    method: (method === "card" || method === "wallet" ? method : "cash") as PaymentMethod,
    amount: Number(row.amount ?? 0),
    paidAt: String(row.paidAt ?? row.paid_at ?? ""),
    channel: parseOrderChannel(row.channel),
  };
}

function boyStatusRank(status?: string): number {
  const s = (status || "").toLowerCase();
  if (s === "available") return 0;
  if (s === "on route") return 1;
  if (s === "off duty") return 3;
  return 2;
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
 * Every method calls a zatgo-core whitelist; the POS is online-only (no local seed, no offline queue).
 */
export const posRepo = {
  orderTotal(order: OrderRecord) {
    return order.items.reduce((n, i) => n + i.qty * i.price, 0);
  },

  async counts(_verticalId?: VerticalId): Promise<PosCounts> {
    const [status, dash] = await Promise.all([
      callZatGoApi<{ items?: number; kds_open?: number }>(ZatGoApi.restoPos.status),
      callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.dashboardCounts),
    ]);
    const items = Number(status.data?.items ?? status.meta?.items ?? 0);
    const kdsOpen = Number(status.data?.kds_open ?? status.meta?.kds_open ?? 0);
    const d = dash.data ?? {};
    const occupied = Number(d.occupiedTables ?? 0);
    const revenue = Number(d.revenueToday ?? 0);
    return {
      freeTables: Number(d.freeTables ?? 0),
      occupiedTables: occupied,
      openOrders: Number(d.openOrders ?? 0),
      kdsTickets: kdsOpen,
      catalogItems: items,
      lowStock: Number(d.lowStock ?? 0),
      todaySales: Number(d.todaySales ?? revenue),
      products: items,
      tablesOccupied: occupied,
      kdsQueued: kdsOpen,
      paymentsToday: Number(d.paymentsToday ?? 0),
      revenueToday: revenue,
    };
  },

  async listProducts(_verticalId?: VerticalId): Promise<ProductRecord[]> {
    const rows = await fetchAllRows(ZatGoApi.restoPos.catalogList);
    return rows.map(mapProduct).filter((p) => p.id);
  },

  async listMenu(verticalId?: VerticalId): Promise<ProductRecord[]> {
    return this.listProducts(verticalId);
  },

  async listOrders(): Promise<OrderRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.ordersList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data).map(mapOrder).filter((o) => o.id);
  },

  async getOrder(id: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersGet, {
      name: id,
    });
    return mapOrder(env.data ?? {});
  },

  async listTables(): Promise<TableRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.tablesList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data).map(mapTable).filter((t) => t.id);
  },

  async listCustomers(search?: string): Promise<CustomerRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.customersList, {
      search: search?.trim() || undefined,
      page: 1,
      page_size: 100,
    });
    return asRows(env.data).map(mapCustomer).filter((c) => c.id);
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

  async listPayments(date?: string): Promise<PaymentRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.paymentsList, {
      date,
      page: 1,
      page_size: 200,
    });
    return asRows(env.data).map(mapPayment).filter((p) => p.id);
  },

  async listInventory(_verticalId?: VerticalId): Promise<InventoryRecord[]> {
    const rows = await fetchAllRows(ZatGoApi.restoPos.stockList);
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? r.id ?? ""),
      unit: String(r.unit ?? "Nos"),
      onHand: Number(r.onHand ?? 0),
      reorderAt: Number(r.reorderAt ?? 0),
      category: String(r.category ?? ""),
      verticals: [],
    }));
  },

  async findByBarcode(code: string, _verticalId?: VerticalId): Promise<ProductRecord | null> {
    const env = await callZatGoApi<Record<string, unknown> | null>(
      ZatGoApi.restoPos.catalogByBarcode,
      { code },
    );
    return env.data ? mapProduct(env.data) : null;
  },

  async upsertMenuItem(
    input: Partial<ProductRecord> & { name: string; price: number },
  ): Promise<ProductRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.catalogUpsert, {
      item_code: input.id || undefined,
      item_name: input.name,
      price: input.price,
      item_group: input.category || undefined,
      barcode: input.barcode || undefined,
      uom: input.unit || undefined,
      enabled: input.available === undefined ? undefined : input.available ? 1 : 0,
    });
    return mapProduct(env.data ?? {});
  },

  async deleteMenuItem(id: string): Promise<void> {
    await callZatGoApi(ZatGoApi.restoPos.catalogDisable, { item_code: id });
  },

  /** Creates the Item when new, then moves stock to `onHand` with a real Stock Entry. */
  async upsertInventory(
    input: Partial<InventoryRecord> & { name: string },
  ): Promise<InventoryRecord> {
    let id = input.id;
    if (!id) {
      const created = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.catalogUpsert, {
        item_name: input.name,
        uom: input.unit || undefined,
      });
      id = String(created.data?.id ?? created.data?.item_code ?? created.data?.name ?? "");
      if (!id) throw new Error("Could not create the item");
    }
    const rows = await this.listInventory();
    const current = rows.find((r) => r.id === id)?.onHand ?? 0;
    const target = input.onHand ?? current;
    const delta = target - current;
    if (delta !== 0) {
      await callZatGoApi(ZatGoApi.restoPos.stockAdjust, {
        item_code: id,
        qty: delta,
        client_id: crypto.randomUUID(),
        reason: "Stock set from ZatGo POS",
      });
    }
    const after = (await this.listInventory()).find((r) => r.id === id);
    if (!after) throw new Error("Item not found after saving");
    return after;
  },

  async upsertCustomer(
    input: Partial<CustomerRecord> & { name: string },
  ): Promise<CustomerRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.customersUpsert, {
      customer_id: input.id || undefined,
      customer_name: input.name,
      phone: input.phone,
      email: input.email,
      client_id: input.id ? undefined : crypto.randomUUID(),
    });
    return mapCustomer(env.data ?? {});
  },

  async sendOrder(orderId: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersSend, {
      order_id: orderId,
    });
    return mapOrder(env.data ?? {});
  },

  async voidOrder(orderId: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersVoid, {
      order_id: orderId,
    });
    return mapOrder(env.data ?? {});
  },

  async setOrderNote(orderId: string, note: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersSetNote, {
      order_id: orderId,
      note,
    });
    return mapOrder(env.data ?? {});
  },

  async giveToDelivery(orderId: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.restoPos.ordersGiveToDelivery,
      { order_id: orderId },
    );
    return mapOrder(env.data ?? {});
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

  async seatTable(tableId: string, covers: number): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.tablesSeat, {
      table_id: tableId,
      covers,
      client_id: crypto.randomUUID(),
    });
    return mapOrder(env.data ?? {});
  },

  async setTableStatus(tableId: string, status: TableStatus): Promise<TableRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.tablesSetStatus, {
      table_id: tableId,
      status,
    });
    return mapTable(env.data ?? {});
  },

  async markBilling(orderId: string): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.restoPos.billingMarkBilling,
      { order_id: orderId },
    );
    return mapOrder(env.data ?? {});
  },

  async payOrder(
    orderId: string,
    method: PaymentRecord["method"],
  ): Promise<{ payment: PaymentRecord; order: OrderRecord }> {
    const key = `pay:${orderId}`;
    const clientId = getOrCreateClientId(key);
    const env = await callZatGoApi<{ order: Record<string, unknown>; payment: Record<string, unknown> }>(
      ZatGoApi.restoPos.billingPay,
      { order_id: orderId, method, client_id: clientId },
    );
    clearClientId(key);
    const data = env.data ?? { order: {}, payment: {} };
    return { order: mapOrder(data.order ?? {}), payment: mapPayment(data.payment ?? {}) };
  },

  async addItemToOrder(
    orderId: string,
    menuItemId: string,
    qty: number,
    extras?: SelectedExtra[],
    price?: number,
    station?: KitchenStation,
  ): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersAddItem, {
      order_id: orderId,
      item_code: menuItemId,
      qty,
      extras,
      rate: price,
      station,
    });
    return mapOrder(env.data ?? {});
  },

  async updateOrderItemQty(
    orderId: string,
    itemId: string,
    qty: number,
  ): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(
      ZatGoApi.restoPos.ordersUpdateItemQty,
      { order_id: orderId, item_row: itemId, qty },
    );
    return mapOrder(env.data ?? {});
  },

  async createOrderFromCart(
    meta: CheckoutMeta,
    items: {
      productId: string;
      name?: string;
      price?: number;
      station?: KitchenStation;
      qty: number;
      extras: SelectedExtra[];
    }[],
  ): Promise<OrderRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersCreate, {
      table: meta.tableId ?? undefined,
      covers: meta.covers ?? 1,
      channel: meta.channel,
      items: items.map((l) => ({
        item_code: l.productId,
        item_name: l.name,
        qty: l.qty,
        rate: l.price ?? 0,
        station: l.station,
        extras: l.extras,
      })),
      customer_id: meta.customerId ?? undefined,
      customer_name: meta.customerName ?? undefined,
      customer_phone: meta.customerPhone ?? undefined,
      delivery: meta.delivery ?? undefined,
      client_id: crypto.randomUUID(),
    });
    return mapOrder(env.data ?? {});
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
    const isDelivery = meta.channel === "delivery";
    if (isDelivery && !meta.delivery?.deliveryBoyId?.trim()) {
      return Promise.reject(new Error("Assign a delivery boy"));
    }

    const clientId = getOrCreateClientId("active_sale");
    const createEnv = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersCreate, {
      table: meta.tableId ?? undefined,
      covers: meta.covers ?? 1,
      channel: meta.channel,
      items: lines.map((l) => ({
        item_code: l.productId,
        item_name: l.name,
        qty: l.qty,
        rate: l.price ?? 0,
        station: l.station,
        extras: l.extras,
      })),
      customer_id: meta.customerId ?? undefined,
      customer_name: meta.customerName ?? undefined,
      customer_phone: meta.customerPhone ?? undefined,
      delivery: meta.delivery ?? undefined,
      client_id: clientId,
    });
    const orderId = String(createEnv.data?.id ?? "");

    const payEnv = await callZatGoApi<{ order: Record<string, unknown>; payment: Record<string, unknown> }>(
      ZatGoApi.restoPos.billingPay,
      {
        order_id: orderId,
        method,
        client_id: clientId,
        // The discount is posted on the Sales Invoice; tax comes from the site's template.
        discount_type: pricing.discount > 0 ? "fixed" : undefined,
        discount_value: pricing.discount > 0 ? Number(pricing.discount.toFixed(2)) : undefined,
      },
    );
    let order = mapOrder(payEnv.data?.order ?? {});
    const payment = mapPayment(payEnv.data?.payment ?? {});

    if (isDelivery) {
      order = await this.giveToDelivery(orderId);
    }

    clearClientId("active_sale");
    return { order, payment };
  },
};
