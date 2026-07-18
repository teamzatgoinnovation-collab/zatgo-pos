import type { VerticalId } from "@/lib/verticals";

export type TableStatus = "free" | "occupied" | "billing";

export type TableRecord = {
  id: string;
  name: string;
  seats: number;
  zone: string;
  status: TableStatus;
  orderId: string | null;
  covers: number;
};

export type KitchenStation = "grill" | "cold" | "bar" | "dessert" | "counter";

export type ProductExtra = {
  id: string;
  name: string;
  price: number;
};

export type SelectedExtra = {
  id: string;
  name: string;
  price: number;
};

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  /** Unit price including selected extras */
  price: number;
  station: KitchenStation;
  status: "queued" | "preparing" | "ready" | "served";
  extras?: SelectedExtra[];
};

export type OrderStatus = "open" | "sent" | "ready" | "paid" | "void";

export type OrderChannel = "dine_in" | "counter" | "walk_in" | "delivery";

export type CustomerRecord = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type DeliveryInfo = {
  address: string;
  phone: string;
  notes?: string;
  /** ZG Delivery Boy name/code assigned at invoice time */
  deliveryBoyId?: string | null;
  deliveryBoyName?: string | null;
};

export type DeliveryStatus = "awaiting" | "handed_off";

export type DeliveryBoyRecord = {
  id: string;
  name: string;
  code?: string;
  phone?: string;
  status?: string;
  vehicle?: string;
  /** Linked ERPNext User (email / name) */
  user?: string;
  /** Login username for Delivery app */
  username?: string;
  /** +10 per successful delivery */
  points?: number;
  deliveriesDone?: number;
  /** 1 star per 50 points */
  bonus?: number;
};

export type OrderRecord = {
  id: string;
  number: string;
  tableId: string | null;
  tableName: string;
  covers: number;
  status: OrderStatus;
  items: OrderItem[];
  openedAt: string;
  server: string;
  channel: OrderChannel;
  note?: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  delivery?: DeliveryInfo | null;
  /** Set when channel is delivery — awaiting kitchen handoff or already given to Delivery. */
  deliveryStatus?: DeliveryStatus | null;
};

export type KdsTicket = {
  id: string;
  orderId: string;
  orderNumber: string;
  tableName: string;
  name: string;
  qty: number;
  station: KitchenStation;
  status: OrderItem["status"];
  openedAt: string;
  extras?: SelectedExtra[];
  server: string;
  note?: string;
};

export type ProductRecord = {
  id: string;
  name: string;
  category: string;
  price: number;
  station: KitchenStation;
  available: boolean;
  sku: string;
  barcode: string;
  verticals: VerticalId[];
  trackBatch?: boolean;
  trackSerial?: boolean;
  requiresPrescription?: boolean;
  unit?: string;
  extras?: ProductExtra[];
};

/** @deprecated use ProductRecord — kept for page import compatibility */
export type MenuItemRecord = ProductRecord;

export type InventoryRecord = {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  reorderAt: number;
  category: string;
  verticals: VerticalId[];
  batchNo?: string;
  expiresAt?: string | null;
};

export type PaymentRecord = {
  id: string;
  orderId: string;
  orderNumber: string;
  method: "cash" | "card" | "wallet";
  amount: number;
  paidAt: string;
  channel: OrderChannel;
};

export type CheckoutMeta = {
  channel: OrderChannel;
  tableId?: string | null;
  tableName?: string | null;
  covers?: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  delivery?: DeliveryInfo | null;
};
