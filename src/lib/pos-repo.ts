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
import { useSessionStore } from "@/store/session";
import { useSiteStore } from "@/store/site";
import { isRetailSite } from "@/lib/site-features";
import { retailSales, type RetailPricing } from "@/lib/retail-cache";
import { classifyFailure, failureInfo } from "@/lib/offline/classify";
import { useConnectivity } from "@/lib/offline/connectivity";
import { useOutbox } from "@/lib/offline/outbox";
import { recordView } from "@/lib/offline/sale-view";
import { getCatalogRows, getCustomerRows } from "@/lib/offline/snapshot";
import { matchCustomers } from "@/lib/customer-search";
import { kickSync } from "@/lib/offline/sync-worker";
import { OfflineBlockedError, discardStaged, promoteToOffline, stageSale } from "@/lib/offline/stage-sale";
import { offlineBridge } from "@/lib/offline/bridge";
import type { OutboxRecord } from "@/lib/offline/types";

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
    stockQty: stockOf(row),
  };
}

/** Cached on-hand quantity when the catalog row carries one (only used for the offline "stock is zero" warning). */
function stockOf(row: Record<string, unknown>): number | undefined {
  const raw = row.stock ?? row.onHand ?? row.actual_qty ?? row.qty_on_hand;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
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
    address: row.address ? String(row.address) : undefined,
    vatNumber: row.vat_number ? String(row.vat_number) : undefined,
    crNumber: row.cr_number ? String(row.cr_number) : undefined,
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

/** Supermarket (retail) mode: catalog/stock/customers/payments/dashboard go to retail_pos instead of resto_pos. */
function isRetail(): boolean {
  return isRetailSite(useSiteStore.getState().profile);
}

/** The API group for the shared catalog/stock/customers/payments/dashboard calls (identical method names). */
function sharedApi() {
  return isRetail() ? ZatGoApi.retailPos : ZatGoApi.restoPos;
}

/** A sale kept on this device (offline or just synced), found by its client id or its invoice number. */
function storedSale(id: string) {
  const rec = useOutbox.getState().records.find((r) => r.id === id || (r.invoice !== null && r.invoice === id));
  return rec ? recordView(rec) : null;
}

/** Short stable fingerprint of a basket, so a lost-response retry reuses its client id but a new basket never does. */
function basketKey(parts: unknown): string {
  const s = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `active_sale:${(h >>> 0).toString(36)}`;
}

/** Not reachable with a usable login: reads come from the device snapshot, counter sales are queued. */
function notOnline(): boolean {
  return useConnectivity.getState().net !== "online";
}

/** A failure that offline mode covers: no network, 5xx, or a lost login (never a 4xx rejection). */
function coveredByOffline(err: unknown): boolean {
  const kind = classifyFailure(failureInfo(err));
  return kind === "transient" || kind === "auth";
}

/** Run a read online; fall back to the device snapshot while offline or when the call fails for a network reason. */
async function readWithSnapshot<T>(online: () => Promise<T>, fromSnapshot: () => Promise<T | null>): Promise<T> {
  if (notOnline()) {
    const snap = await fromSnapshot();
    if (snap !== null) return snap;
  }
  try {
    return await online();
  } catch (err) {
    if (coveredByOffline(err)) {
      const info = failureInfo(err);
      if (info.network) useConnectivity.getState().markNetworkFailure();
      const snap = await fromSnapshot();
      if (snap !== null) return snap;
    }
    throw err;
  }
}

/** Provisional sale as the receipt shows it while the site has not posted it yet. */
function provisionalSale(input: {
  id: string;
  number: string;
  at: string;
  lines: { productId: string; name?: string; price?: number; qty: number; station?: KitchenStation; extras?: SelectedExtra[] }[];
  method: PaymentMethod;
  pricing: { amount: number; discount: number; tax: number };
  meta: CheckoutMeta;
}): { order: OrderRecord; payment: PaymentRecord; pricing: RetailPricing } {
  const session = useSessionStore.getState();
  const { id, number, at, lines, method, pricing, meta } = input;
  const order: OrderRecord = {
    id,
    number,
    tableId: null,
    tableName: "",
    covers: 1,
    status: "paid",
    items: lines.map((l, i) => ({
      id: `${id}-${i}`,
      name: l.name ?? l.productId,
      qty: l.qty,
      price: l.price ?? 0,
      station: l.station ?? "counter",
      status: "served",
      extras: l.extras?.length ? l.extras : undefined,
    })),
    openedAt: at,
    server: session.fullName || session.user || "",
    channel: "counter",
    customerId: meta.customerId ?? null,
    customerName: meta.customerName ?? null,
    customerPhone: meta.customerPhone ?? null,
    delivery: null,
    deliveryStatus: null,
  };
  const payment: PaymentRecord = {
    id,
    orderId: id,
    orderNumber: number,
    method,
    amount: pricing.amount,
    paidAt: at,
    channel: "counter",
  };
  // Provisional: the site re-reads the tax and posts its own figures at sync.
  const posted: RetailPricing = {
    subtotal: pricing.amount - pricing.tax + pricing.discount,
    discount: pricing.discount,
    tax: pricing.tax,
    total: pricing.amount,
  };
  return { order, payment, pricing: posted };
}

export type PendingSyncInfo = { ref: string };

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
  itemsSoldToday: number;
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
    return readWithSnapshot(
      () => this.countsOnline(),
      async () => {
        const rows = await getCatalogRows();
        if (!rows) return null;
        return {
          freeTables: 0, occupiedTables: 0, openOrders: 0, kdsTickets: 0, catalogItems: rows.length, lowStock: 0,
          todaySales: 0, products: rows.length, tablesOccupied: 0, kdsQueued: 0, paymentsToday: 0, revenueToday: 0,
          itemsSoldToday: 0,
        };
      },
    );
  },

  async countsOnline(): Promise<PosCounts> {
    if (isRetail()) {
      const [catalog, dash] = await Promise.all([
        callZatGoApi<unknown[]>(ZatGoApi.retailPos.catalogList, { page: 1, page_size: 1 }),
        callZatGoApi<Record<string, unknown>>(ZatGoApi.retailPos.dashboardCounts),
      ]);
      const items = Number(catalog.meta?.total ?? 0);
      const d = dash.data ?? {};
      const revenue = Number(d.revenueToday ?? 0);
      return {
        freeTables: 0,
        occupiedTables: 0,
        openOrders: 0,
        kdsTickets: 0,
        catalogItems: items,
        lowStock: Number(d.lowStock ?? 0),
        todaySales: Number(d.todaySales ?? 0),
        products: items,
        tablesOccupied: 0,
        kdsQueued: 0,
        paymentsToday: Number(d.paymentsToday ?? 0),
        revenueToday: revenue,
        itemsSoldToday: Number(d.itemsSoldToday ?? 0),
      };
    }
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
      itemsSoldToday: 0,
    };
  },

  async listProducts(_verticalId?: VerticalId): Promise<ProductRecord[]> {
    return readWithSnapshot(
      async () => {
        const rows = await fetchAllRows(sharedApi().catalogList);
        return rows.map(mapProduct).filter((p) => p.id);
      },
      async () => {
        const rows = await getCatalogRows();
        return rows ? rows.map(mapProduct).filter((p) => p.id) : null;
      },
    );
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
    const stored = storedSale(id);
    if (stored) return stored.order;
    if (isRetail()) {
      const sale = retailSales.get(id);
      if (!sale) {
        throw new Error("Only invoices sold in this session can be re-opened here. Open it from the site.");
      }
      return sale.order;
    }
    const env = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersGet, {
      name: id,
    });
    return mapOrder(env.data ?? {});
  },

  /** Whether a paid invoice can be re-opened as a receipt/invoice here (retail: only this session's sales). */
  canReopen(orderId: string): boolean {
    return storedSale(orderId) !== null || !isRetail() || retailSales.has(orderId);
  },

  /** Server-posted figures of a retail sale made in this session (null otherwise). */
  salePricing(orderId: string): RetailPricing | null {
    return storedSale(orderId)?.pricing ?? retailSales.get(orderId)?.pricing ?? null;
  },

  /** Whether the receipt for this sale is still the offline one (the site has not posted it yet). */
  pendingSyncRef(orderId: string): string | null {
    const v = storedSale(orderId);
    return v?.pendingSync ? v.offlineRef : null;
  },

  async listTables(): Promise<TableRecord[]> {
    const env = await callZatGoApi<unknown[]>(ZatGoApi.restoPos.tablesList, {
      page: 1,
      page_size: 100,
    });
    return asRows(env.data).map(mapTable).filter((t) => t.id);
  },

  async listCustomers(search?: string): Promise<CustomerRecord[]> {
    return readWithSnapshot(
      async () => {
        const env = await callZatGoApi<unknown[]>(sharedApi().customersList, {
          search: search?.trim() || undefined,
          page: 1,
          page_size: 100,
        });
        return asRows(env.data).map(mapCustomer).filter((c) => c.id);
      },
      async () => {
        const rows = await getCustomerRows();
        if (!rows) return null;
        return matchCustomers(rows.map(mapCustomer).filter((c) => c.id), search ?? "");
      },
    );
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
    // Sales still waiting on this device come first (they are not on the site yet).
    const waiting = (): PaymentRecord[] =>
      useOutbox
        .getState()
        .records.filter((r) => r.state !== "synced")
        .map((r) => recordView(r)?.payment)
        .filter((p): p is PaymentRecord => Boolean(p))
        .reverse();
    return readWithSnapshot(
      async () => {
        const env = await callZatGoApi<unknown[]>(sharedApi().paymentsList, {
          date,
          page: 1,
          page_size: 200,
        });
        return [...waiting(), ...asRows(env.data).map(mapPayment).filter((p) => p.id)];
      },
      async () => waiting(),
    );
  },

  async listInventory(_verticalId?: VerticalId): Promise<InventoryRecord[]> {
    const rows = await fetchAllRows(sharedApi().stockList);
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
    return readWithSnapshot<ProductRecord | null>(
      async () => {
        const env = await callZatGoApi<Record<string, unknown> | null>(
          sharedApi().catalogByBarcode,
          { code },
        );
        return env.data ? mapProduct(env.data) : null;
      },
      async () => {
        const rows = await getCatalogRows();
        if (!rows) return null;
        const c = code.trim();
        const hit = rows.map(mapProduct).find((p) => p.barcode === c || p.sku === c || p.id === c);
        return hit ?? null;
      },
    );
  },

  async upsertMenuItem(
    input: Partial<ProductRecord> & { name: string; price: number },
  ): Promise<ProductRecord> {
    const env = await callZatGoApi<Record<string, unknown>>(sharedApi().catalogUpsert, {
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
    await callZatGoApi(sharedApi().catalogDisable, { item_code: id });
  },

  /** Creates the Item when new, then moves stock to `onHand` with a real Stock Entry. */
  async upsertInventory(
    input: Partial<InventoryRecord> & { name: string },
  ): Promise<InventoryRecord> {
    let id = input.id;
    if (!id) {
      const created = await callZatGoApi<Record<string, unknown>>(sharedApi().catalogUpsert, {
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
      await callZatGoApi(sharedApi().stockAdjust, {
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
    const env = await callZatGoApi<Record<string, unknown>>(sharedApi().customersUpsert, {
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

  /**
   * Supermarket: ONE submitted Sales Invoice + Payment Entry (counter only), idempotent on the client id.
   * The sale and its payload are written to the device outbox BEFORE the call (write-ahead); offline, or when the
   * call fails for a network/5xx/login reason, it stays there as an offline sale and the sync worker posts it later.
   */
  async checkoutRetail(
    lines: { productId: string; name?: string; price?: number; qty: number }[],
    method: PaymentMethod,
    pricing: { amount: number; discount: number; tax: number },
    meta: CheckoutMeta,
  ): Promise<{ order: OrderRecord; payment: PaymentRecord; pricing: RetailPricing; pendingSync?: PendingSyncInfo }> {
    const session0 = useSessionStore.getState();
    const saleKey = basketKey({
      lines: lines.map((l) => [l.productId, l.qty, l.price ?? 0]),
      method,
      discount: pricing.discount,
      customer: [meta.customerId ?? null, meta.customerName ?? null],
      user: session0.user,
      site: useSiteStore.getState().profile?.company ?? null,
    });
    const clientId = getOrCreateClientId(saleKey);
    const saleTime = new Date();
    const args = {
      items: lines.map((l) => ({
        item_code: l.productId,
        item_name: l.name,
        qty: l.qty,
        rate: l.price ?? 0,
      })),
      method,
      client_id: clientId,
      customer_id: meta.customerId ?? undefined,
      customer_name: meta.customerName ?? undefined,
      customer_phone: meta.customerPhone ?? undefined,
      // The discount is posted on the Sales Invoice; tax comes from the site's template.
      discount_type: pricing.discount > 0 ? "fixed" : undefined,
      discount_value: pricing.discount > 0 ? Number(pricing.discount.toFixed(2)) : undefined,
    };
    const staged = await stageSale({
      clientId,
      kind: "retail.sale",
      payload: args,
      user: session0.user ?? "",
      company: useSiteStore.getState().profile?.company ?? null,
      site: session0.connection.baseUrl,
      method,
      expectedTotal: pricing.amount,
      expectedTax: pricing.tax,
      saleTime,
    }).catch(() => null);

    const goOffline = async () => {
      if (!staged) {
        throw new OfflineBlockedError("This device cannot save offline sales right now. Reconnect to sell.", "no-storage");
      }
      const rec = await promoteToOffline(staged, (ref) =>
        provisionalSale({ id: clientId, number: ref, at: saleTime.toISOString(), lines, method, pricing, meta }),
      );
      clearClientId(saleKey);
      kickSync();
      return queuedResult(rec);
    };

    if (notOnline()) return goOffline();

    let env: Awaited<ReturnType<typeof callZatGoApi<{ invoice: Record<string, unknown>; payment: Record<string, unknown> }>>>;
    try {
      env = await callZatGoApi<{
        invoice: Record<string, unknown>;
        payment: Record<string, unknown>;
      }>(ZatGoApi.retailPos.saleCreate, args);
    } catch (err) {
      if (staged && coveredByOffline(err)) {
        if (failureInfo(err).network) useConnectivity.getState().markNetworkFailure();
        try {
          return await goOffline();
        } catch (blocked) {
          // Not allowed offline (limits / card / disabled): show why, but say what actually went wrong too.
          if (blocked instanceof OfflineBlockedError) {
            throw new Error(`${err instanceof Error ? err.message : "The site did not answer"} — ${blocked.message}`);
          }
          throw blocked;
        }
      }
      await discardStaged(clientId);
      throw err;
    }
    await discardStaged(clientId);
    const inv = env.data?.invoice ?? {};
    const pay = env.data?.payment ?? {};
    const invoiceId = String(inv.id ?? "");
    if (!invoiceId) throw new Error("The site did not return an invoice");
    const postedAt = String(inv.postedAt ?? pay.paidAt ?? new Date().toISOString());
    const session = useSessionStore.getState();
    const order: OrderRecord = {
      id: invoiceId,
      number: invoiceId,
      tableId: null,
      tableName: "",
      covers: 1,
      status: "paid",
      items: lines.map((l, i) => ({
        id: `${invoiceId}-${i}`,
        name: l.name ?? l.productId,
        qty: l.qty,
        price: l.price ?? 0,
        station: "counter",
        status: "served",
      })),
      openedAt: postedAt,
      server: session.fullName || session.user || "",
      channel: "counter",
      customerId: meta.customerId ?? null,
      customerName: meta.customerName ?? (inv.customer ? String(inv.customer) : null),
      customerPhone: meta.customerPhone ?? null,
      delivery: null,
      deliveryStatus: null,
      // The invoice's stored ZATCA QR payloads (Phase 1 from the core; Phase 2 once the ZATCA Integration app stamped it).
      zatcaQr: inv.zatcaQr ? String(inv.zatcaQr) : undefined,
      zatcaQrP2: inv.zatcaQrP2 ? String(inv.zatcaQrP2) : undefined,
    };
    const payment = mapPayment({
      id: pay.id,
      orderId: invoiceId,
      orderNumber: invoiceId,
      method: pay.method ?? method,
      amount: pay.amount ?? inv.total ?? pricing.amount,
      // The invoice's own date-time (the Payment Entry only has a date): the receipt and its ZATCA QR carry this moment.
      paidAt: postedAt,
      channel: "counter",
    });
    // The posted figures are authoritative: the receipt must match the invoice and Payment Entry.
    const posted: RetailPricing = {
      subtotal: Number(inv.subtotal ?? pricing.amount - pricing.tax + pricing.discount),
      discount: Number(inv.discount ?? pricing.discount),
      tax: Number(inv.tax ?? pricing.tax),
      total: Number(inv.total ?? pricing.amount),
    };
    retailSales.set(invoiceId, { order, pricing: posted });
    clearClientId(saleKey);
    return { order, payment, pricing: posted };
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
  ): Promise<{ order: OrderRecord; payment: PaymentRecord; pricing?: RetailPricing; pendingSync?: PendingSyncInfo }> {
    if (!lines.length) {
      return Promise.reject(new Error("Cart is empty"));
    }
    if (isRetail()) return this.checkoutRetail(lines, method, pricing, meta);
    const isDelivery = meta.channel === "delivery";
    if (isDelivery && !meta.delivery?.deliveryBoyId?.trim()) {
      return Promise.reject(new Error("Assign a delivery boy"));
    }
    // Only plain counter sales can be taken offline; tables, kitchen tickets and delivery need the site.
    const counterSale = (meta.channel === "counter" || meta.channel === "walk_in") && !meta.tableId && !isDelivery;
    if (!counterSale && notOnline()) {
      return Promise.reject(new Error("Dine-in, table and delivery orders need a connection. Counter sales still work offline."));
    }

    const clientId = getOrCreateClientId("active_sale");
    const saleTime = new Date();
    const createArgs = {
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
    };
    // The discount is posted on the Sales Invoice; tax comes from the site's template.
    const payArgs = {
      method,
      client_id: clientId,
      discount_type: pricing.discount > 0 ? "fixed" : undefined,
      discount_value: pricing.discount > 0 ? Number(pricing.discount.toFixed(2)) : undefined,
    };
    const session0 = useSessionStore.getState();
    const staged = counterSale
      ? await stageSale({
          clientId,
          kind: "resto.counter",
          payload: { create: createArgs, pay: payArgs },
          user: session0.user ?? "",
          company: useSiteStore.getState().profile?.company ?? null,
          site: session0.connection.baseUrl,
          method,
          expectedTotal: pricing.amount,
          expectedTax: pricing.tax,
          saleTime,
        }).catch(() => null)
      : null;

    const goOffline = async () => {
      if (!staged) {
        throw new OfflineBlockedError("This device cannot save offline sales right now. Reconnect to sell.", "no-storage");
      }
      const rec = await promoteToOffline(staged, (ref) =>
        provisionalSale({ id: clientId, number: ref, at: saleTime.toISOString(), lines, method, pricing, meta }),
      );
      clearClientId("active_sale");
      kickSync();
      return queuedResult(rec);
    };

    if (notOnline()) return goOffline();

    try {
      const createEnv = await callZatGoApi<Record<string, unknown>>(ZatGoApi.restoPos.ordersCreate, createArgs);
      const orderId = String(createEnv.data?.id ?? "");
      const payEnv = await callZatGoApi<{ order: Record<string, unknown>; payment: Record<string, unknown> }>(
        ZatGoApi.restoPos.billingPay,
        { ...payArgs, order_id: orderId },
      );
      let order = mapOrder(payEnv.data?.order ?? {});
      const payment = mapPayment(payEnv.data?.payment ?? {});
      await discardStaged(clientId);
      if (isDelivery) {
        order = await this.giveToDelivery(orderId);
      }
      clearClientId("active_sale");
      return { order, payment };
    } catch (err) {
      if (staged && coveredByOffline(err)) {
        if (failureInfo(err).network) useConnectivity.getState().markNetworkFailure();
        try {
          return await goOffline();
        } catch (blocked) {
          if (blocked instanceof OfflineBlockedError) {
            throw new Error(`${err instanceof Error ? err.message : "The site did not answer"} — ${blocked.message}`);
          }
          throw blocked;
        }
      }
      if (staged) await discardStaged(clientId);
      throw err;
    }
  },
};

/** What the checkout screen gets for a sale that was saved offline. */
function queuedResult(rec: OutboxRecord) {
  const view = recordView(rec)!;
  return { order: view.order, payment: view.payment, pricing: view.pricing, pendingSync: { ref: rec.offlineRef } };
}
