import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, cn, PageHeader } from "@zatgo/ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryChips } from "@/components/pos/CategoryChips";
import { ConfirmDialog } from "@/components/pos/ConfirmDialog";
import { DocumentPreviewDialog } from "@/components/pos/DocumentPreviewDialog";
import { ExtraPickerDialog } from "@/components/pos/ExtraPickerDialog";
import { OrderDetailDialog } from "@/components/pos/OrderDetailDialog";
import { OrderTicketPanel } from "@/components/pos/OrderTicketPanel";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { SendKitchenDialog } from "@/components/pos/SendKitchenDialog";
import {
  posRepo,
  type OrderItem,
  type OrderRecord,
  type ProductRecord,
  type SelectedExtra,
} from "@/lib/pos-repo";
import { printPosDocument } from "@/lib/print";
import {
  buildKitchenDocument,
  buildSaleDocument,
  type PosDocument,
} from "@/lib/pos-document";
import { useBusinessStore } from "@/store/business";

export function OrdersPage() {
  const qc = useQueryClient();
  const profile = useBusinessStore((s) => s.profile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<PosDocument | null>(null);
  const [printing, setPrinting] = useState(false);
  const [extraProduct, setExtraProduct] = useState<ProductRecord | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["pos", "orders"],
    queryFn: () => posRepo.listOrders(),
  });
  const verticalId = useBusinessStore((s) => s.verticalId);
  const { data: menu = [] } = useQuery({
    queryKey: ["pos", "products", verticalId],
    queryFn: () => posRepo.listProducts(verticalId),
  });

  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== "paid" && o.status !== "void"),
    [orders],
  );
  const selected =
    openOrders.find((o) => o.id === selectedId) ?? openOrders[0] ?? null;

  const categories = useMemo(
    () => ["all", ...new Set(menu.map((p) => p.category))],
    [menu],
  );

  const visibleMenu = useMemo(() => {
    return menu.filter((p) => {
      if (!p.available) return false;
      if (category !== "all" && p.category !== category) return false;
      return true;
    });
  }, [menu, category]);

  const qtyOnTicket = (productId: string) => {
    if (!selected) return 0;
    const product = menu.find((p) => p.id === productId);
    if (!product) return 0;
    return selected.items
      .filter((i) => i.name === product.name)
      .reduce((n, i) => n + i.qty, 0);
  };

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const addItem = useMutation({
    mutationFn: ({
      orderId,
      menuItemId,
      extras,
    }: {
      orderId: string;
      menuItemId: string;
      extras?: SelectedExtra[];
    }) => posRepo.addItemToOrder(orderId, menuItemId, 1, extras),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const updateQty = useMutation({
    mutationFn: ({
      orderId,
      itemId,
      qty,
    }: {
      orderId: string;
      itemId: string;
      qty: number;
    }) => posRepo.updateOrderItemQty(orderId, itemId, qty),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (orderId: string) => posRepo.sendOrder(orderId),
    onSuccess: () => {
      invalidate();
      setSendOpen(false);
      toast.success("Sent to kitchen");
    },
  });

  const saveNote = useMutation({
    mutationFn: ({ orderId, note }: { orderId: string; note: string }) =>
      posRepo.setOrderNote(orderId, note),
    onSuccess: () => {
      invalidate();
      toast.success("Note saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidOrder = useMutation({
    mutationFn: (orderId: string) => posRepo.voidOrder(orderId),
    onSuccess: () => {
      invalidate();
      setVoidOpen(false);
      setDetailOpen(false);
      setSelectedId(null);
      toast.success("Order voided");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToDelivery = useMutation({
    mutationFn: (orderId: string) => posRepo.giveToDelivery(orderId),
    onSuccess: (updated) => {
      invalidate();
      setDetailOpen(false);
      toast.success(`Order #${updated.number} given to Delivery`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitToOrder = (product: ProductRecord, extras: SelectedExtra[] = []) => {
    if (!selected) {
      toast.message("Select or open a check first");
      return;
    }
    addItem.mutate({ orderId: selected.id, menuItemId: product.id, extras });
  };

  const onAddProduct = (product: ProductRecord) => {
    if (!selected) {
      toast.message("Select or open a check first");
      return;
    }
    if (product.extras?.length) {
      setExtraProduct(product);
      return;
    }
    commitToOrder(product);
  };

  const onIncrement = (item: OrderItem) => {
    if (!selected) return;
    updateQty.mutate({ orderId: selected.id, itemId: item.id, qty: item.qty + 1 });
  };

  const onDecrement = (item: OrderItem) => {
    if (!selected) return;
    updateQty.mutate({ orderId: selected.id, itemId: item.id, qty: item.qty - 1 });
  };

  const onRemove = (item: OrderItem) => {
    if (!selected) return;
    updateQty.mutate({ orderId: selected.id, itemId: item.id, qty: 0 });
  };

  const onPrintKitchen = async (order = selected) => {
    if (!order) return;
    const doc = buildKitchenDocument({ profile, order });
    setPreview(doc);
    setPrinting(true);
    try {
      const result = await printPosDocument(doc);
      if (!result.ok) toast.error(result.message);
      else toast.success("Kitchen ticket printed");
    } finally {
      setPrinting(false);
    }
  };

  const onPrintInvoice = () => {
    if (!selected) return;
    setPreview(buildSaleDocument({ kind: "invoice", profile, order: selected }));
  };

  const busy =
    send.isPending ||
    saveNote.isPending ||
    voidOrder.isPending ||
    printing;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-2">
        <PageHeader
          title="Orders"
          description="Checks, kitchen fire, notes, and void — use Details for the full order modal."
        />
        <Button
          variant="outline"
          className="h-9"
          disabled={!selected}
          onClick={() => setDetailOpen(true)}
        >
          Order details
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="max-h-[40vh] space-y-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] p-2 lg:max-h-none">
          {openOrders.length === 0 ? (
            <p className="p-3 text-sm text-[var(--color-muted-foreground)]">No open orders</p>
          ) : (
            openOrders.map((order) => (
              <OrderListButton
                key={order.id}
                order={order}
                active={selected?.id === order.id}
                onClick={() => setSelectedId(order.id)}
                onOpenDetails={() => {
                  setSelectedId(order.id);
                  setDetailOpen(true);
                }}
              />
            ))
          )}
        </aside>

        <OrderTicketPanel
          order={selected}
          total={selected ? posRepo.orderTotal(selected) : 0}
          sending={send.isPending}
          printing={printing}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onRemove={onRemove}
          onSend={() => setSendOpen(true)}
          onPrintKitchen={() => void onPrintKitchen()}
          onOpenDetails={() => setDetailOpen(true)}
        />

        <aside className="flex min-h-[320px] flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 lg:min-h-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Menu
          </p>
          <CategoryChips
            categories={categories}
            value={category}
            onChange={setCategory}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ProductGrid
              products={visibleMenu}
              qtyOf={qtyOnTicket}
              onAdd={onAddProduct}
              compact
            />
          </div>
        </aside>
      </div>

      <ExtraPickerDialog
        open={Boolean(extraProduct)}
        product={extraProduct}
        onClose={() => setExtraProduct(null)}
        onConfirm={(extras) => {
          if (!extraProduct) return;
          commitToOrder(extraProduct, extras);
          setExtraProduct(null);
        }}
      />

      <SendKitchenDialog
        open={sendOpen}
        order={selected}
        busy={send.isPending}
        onClose={() => setSendOpen(false)}
        onConfirm={() => selected && send.mutate(selected.id)}
      />

      <OrderDetailDialog
        open={detailOpen}
        order={selected}
        total={selected ? posRepo.orderTotal(selected) : 0}
        busy={busy || giveToDelivery.isPending}
        onClose={() => setDetailOpen(false)}
        onSendKitchen={() => {
          setDetailOpen(false);
          setSendOpen(true);
        }}
        onPrintKitchen={() => void onPrintKitchen()}
        onPrintInvoice={onPrintInvoice}
        onVoid={() => setVoidOpen(true)}
        onSaveNote={(note) =>
          selected && saveNote.mutate({ orderId: selected.id, note })
        }
        onGiveToDelivery={() => selected && giveToDelivery.mutate(selected.id)}
      />

      <ConfirmDialog
        open={voidOpen}
        title="Void order?"
        description={
          selected
            ? `Void #${selected.number} on ${selected.tableName}? The table will be freed.`
            : "Void this order?"
        }
        confirmLabel="Void order"
        danger
        busy={voidOrder.isPending}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => selected && voidOrder.mutate(selected.id)}
      />

      <DocumentPreviewDialog
        open={Boolean(preview)}
        document={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function OrderListButton({
  order,
  active,
  onClick,
  onOpenDetails,
}: {
  order: OrderRecord;
  active: boolean;
  onClick: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] transition-colors",
        active ? "bg-[var(--pos-sidebar-active)]" : "hover:bg-[var(--color-muted)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full flex-col px-3 py-2 text-left text-sm",
          active && "font-medium",
        )}
      >
        <span>
          #{order.number} · {order.tableName}
        </span>
        <span className="text-xs text-[var(--color-muted-foreground)] capitalize">
          {order.status} · ${posRepo.orderTotal(order).toFixed(2)}
          {order.note ? " · note" : ""}
        </span>
      </button>
      <button
        type="button"
        className="w-full px-3 pb-2 text-left text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        onClick={onOpenDetails}
      >
        Open modal →
      </button>
    </div>
  );
}
