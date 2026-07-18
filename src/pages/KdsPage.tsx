import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, cn } from "@zatgo/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/pos/ConfirmDialog";
import { DocumentPreviewDialog } from "@/components/pos/DocumentPreviewDialog";
import { KdsTicketDialog } from "@/components/pos/KdsTicketDialog";
import { OrderDetailDialog } from "@/components/pos/OrderDetailDialog";
import { SendKitchenDialog } from "@/components/pos/SendKitchenDialog";
import { PageHeader } from "@/components/PageHeader";
import {
  posRepo,
  type KitchenStation,
  type KdsTicket,
  type OrderRecord,
} from "@/lib/pos-repo";
import { printPosDocument } from "@/lib/print";
import {
  buildKitchenDocument,
  buildSaleDocument,
  type PosDocument,
} from "@/lib/pos-document";
import { useBusinessStore } from "@/store/business";

const stationLabel = {
  grill: "Grill",
  cold: "Cold",
  bar: "Bar",
  dessert: "Dessert",
} as const;

const statusBg = {
  queued: "bg-[var(--pos-kds-new)]",
  preparing: "bg-[var(--pos-kds-prep)]",
  ready: "bg-[var(--pos-kds-ready)]",
} as const;

export function KdsPage() {
  const qc = useQueryClient();
  const profile = useBusinessStore((s) => s.profile);
  const [ticket, setTicket] = useState<KdsTicket | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [bumpStation, setBumpStation] = useState<keyof typeof stationLabel | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [preview, setPreview] = useState<PosDocument | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["pos", "kds"],
    queryFn: () => posRepo.listKdsTickets(),
    refetchInterval: 5_000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const advance = useMutation({
    mutationFn: (itemId: string) => posRepo.advanceKdsItem(itemId),
    onSuccess: (item) => {
      invalidate();
      setTicket((prev) =>
        prev && prev.id === item.id ? { ...prev, status: item.status } : prev,
      );
      toast.success(`${item.name} → ${item.status}`);
      if (item.status === "served") setTicket(null);
    },
  });

  const recall = useMutation({
    mutationFn: (itemId: string) => posRepo.recallKdsItem(itemId),
    onSuccess: (item) => {
      invalidate();
      setTicket((prev) =>
        prev && prev.id === item.id ? { ...prev, status: item.status } : prev,
      );
      toast.success(`Recalled ${item.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bump = useMutation({
    mutationFn: (station: keyof typeof stationLabel) =>
      posRepo.bumpStationReady(station as KitchenStation),
    onSuccess: ({ count }, station) => {
      invalidate();
      setBumpStation(null);
      toast.success(
        count
          ? `Bumped ${count} ready on ${stationLabel[station]}`
          : "Nothing ready to bump",
      );
    },
  });

  const send = useMutation({
    mutationFn: (orderId: string) => posRepo.sendOrder(orderId),
    onSuccess: () => {
      invalidate();
      setSendOpen(false);
      toast.success("Order refreshed on KDS");
    },
  });

  const saveNote = useMutation({
    mutationFn: ({ orderId, note }: { orderId: string; note: string }) =>
      posRepo.setOrderNote(orderId, note),
    onSuccess: (updated) => {
      invalidate();
      setOrder(updated);
      toast.success("Note saved");
    },
  });

  const voidOrder = useMutation({
    mutationFn: (orderId: string) => posRepo.voidOrder(orderId),
    onSuccess: () => {
      invalidate();
      setVoidOpen(false);
      setOrder(null);
      setTicket(null);
      toast.success("Order voided");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToDelivery = useMutation({
    mutationFn: (orderId: string) => posRepo.giveToDelivery(orderId),
    onSuccess: (updated) => {
      invalidate();
      setOrder(null);
      toast.success(`Order #${updated.number} given to Delivery`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadOrder = async (orderId: string) => {
    const full = await posRepo.getOrder(orderId);
    setOrder(full);
  };

  const printOrderKitchen = async (orderId: string) => {
    const full = await posRepo.getOrder(orderId);
    const doc = buildKitchenDocument({ profile, order: full });
    setPreview(doc);
    const result = await printPosDocument(doc);
    if (!result.ok) toast.error(result.message);
    else toast.success("Kitchen chit printed");
  };

  const stations = Object.keys(stationLabel) as Array<keyof typeof stationLabel>;
  const busy =
    advance.isPending || recall.isPending || bump.isPending || send.isPending;

  return (
    <div>
      <PageHeader
        title="Kitchen display"
        description="Tap a ticket for the KDS modal. Advance, recall, print, or open the full order."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        {stations.map((station) => {
          const tickets = data.filter((t) => t.station === station);
          const readyCount = tickets.filter((t) => t.status === "ready").length;
          return (
            <section
              key={station}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{stationLabel[station]}</h2>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={!readyCount}
                  onClick={() => setBumpStation(station)}
                >
                  Bump ready ({readyCount})
                </Button>
              </div>
              <div className="space-y-2">
                {tickets.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">Clear</p>
                ) : (
                  tickets.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setTicket(row)}
                      className={cn(
                        "w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 text-left transition-colors",
                        statusBg[row.status as keyof typeof statusBg] ?? "",
                        "hover:opacity-95",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {row.qty}× {row.name}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            #{row.orderNumber} · {row.tableName}
                          </p>
                          {row.extras?.length ? (
                            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                              + {row.extras.map((e) => e.name).join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-xs capitalize">{row.status}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <KdsTicketDialog
        open={Boolean(ticket)}
        ticket={ticket}
        busy={busy}
        onClose={() => setTicket(null)}
        onAdvance={() => ticket && advance.mutate(ticket.id)}
        onRecall={() => ticket && recall.mutate(ticket.id)}
        onPrintOrder={() => ticket && void printOrderKitchen(ticket.orderId)}
        onViewOrder={() => {
          if (!ticket) return;
          void loadOrder(ticket.orderId).then(() => setTicket(null));
        }}
      />

      <OrderDetailDialog
        open={Boolean(order)}
        order={order}
        total={order ? posRepo.orderTotal(order) : 0}
        busy={busy || saveNote.isPending || voidOrder.isPending || giveToDelivery.isPending}
        onClose={() => setOrder(null)}
        onSendKitchen={() => setSendOpen(true)}
        onPrintKitchen={() => order && void printOrderKitchen(order.id)}
        onPrintInvoice={() => {
          if (!order) return;
          setPreview(buildSaleDocument({ kind: "invoice", profile, order }));
        }}
        onVoid={() => setVoidOpen(true)}
        onSaveNote={(note) => order && saveNote.mutate({ orderId: order.id, note })}
        onGiveToDelivery={() => order && giveToDelivery.mutate(order.id)}
      />

      <SendKitchenDialog
        open={sendOpen}
        order={order}
        busy={send.isPending}
        onClose={() => setSendOpen(false)}
        onConfirm={() => order && send.mutate(order.id)}
      />

      <ConfirmDialog
        open={voidOpen}
        title="Void order?"
        description={
          order
            ? `Void #${order.number} on ${order.tableName}? The table will be freed.`
            : "Void this order?"
        }
        confirmLabel="Void order"
        danger
        busy={voidOrder.isPending}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => order && voidOrder.mutate(order.id)}
      />

      <ConfirmDialog
        open={Boolean(bumpStation)}
        title="Bump all ready?"
        description={
          bumpStation
            ? `Mark every ready ticket on ${stationLabel[bumpStation]} as served.`
            : ""
        }
        confirmLabel="Bump station"
        busy={bump.isPending}
        onClose={() => setBumpStation(null)}
        onConfirm={() => bumpStation && bump.mutate(bumpStation)}
      />

      <DocumentPreviewDialog
        open={Boolean(preview)}
        document={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
