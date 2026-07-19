import { Button, FormDialog } from "@zatgo/ui";
import { CookingPot, FileText, Printer, ScrollText, Truck } from "@zatgo/icons";
import { useEffect, useState } from "react";
import type { OrderRecord } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";

export function OrderDetailDialog({
  open,
  order,
  total,
  busy,
  onClose,
  onSendKitchen,
  onPrintKitchen,
  onPrintInvoice,
  onVoid,
  onSaveNote,
  onGiveToDelivery,
}: {
  open: boolean;
  order: OrderRecord | null;
  total: number;
  busy?: boolean;
  onClose: () => void;
  onSendKitchen: () => void;
  onPrintKitchen: () => void;
  onPrintInvoice: () => void;
  onVoid: () => void;
  onSaveNote: (note: string) => void;
  onGiveToDelivery?: () => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && order) setNote(order.note ?? "");
  }, [open, order?.id, order?.note]);

  if (!order) return null;

  const canGiveToDelivery =
    Boolean(onGiveToDelivery) &&
    order.channel === "delivery" &&
    order.status === "ready" &&
    order.deliveryStatus !== "handed_off";

  return (
    <FormDialog
      open={open}
      title={`Order #${order.number}`}
      onClose={onClose}
      className="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            className="text-red-600"
            disabled={busy || order.status === "paid"}
            onClick={onVoid}
          >
            Void
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-[var(--color-muted-foreground)]">
          <p className="font-medium text-[var(--color-foreground)]">
            {order.tableName} · {order.covers} covers
          </p>
          <p className="capitalize">
            {order.status} · {order.server} · {order.channel.replaceAll("_", " ")}
            {order.deliveryStatus ? ` · ${order.deliveryStatus.replaceAll("_", " ")}` : ""}
          </p>
          <p>{new Date(order.openedAt).toLocaleString()}</p>
          {order.channel === "delivery" && order.delivery ? (
            <p className="mt-1 text-[var(--color-foreground)]">
              {order.customerName ? `${order.customerName} · ` : ""}
              {order.delivery.address}
              {order.delivery.phone ? ` · ${order.delivery.phone}` : ""}
              {order.delivery.deliveryBoyName
                ? ` · Boy: ${order.delivery.deliveryBoyName}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--color-muted-foreground)]">Total</p>
          <p className="text-2xl font-semibold tabular-nums">${total.toFixed(2)}</p>
        </div>
      </div>

      <ul className="mb-4 max-h-[28vh] space-y-2 overflow-auto">
        {order.items.length === 0 ? (
          <li className="text-sm text-[var(--color-muted-foreground)]">No items yet</li>
        ) : (
          order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {item.qty}× {item.name}
                </p>
                {item.extras?.length ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {formatExtras(item.extras)}
                  </p>
                ) : null}
                <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
                  {item.station} · {item.status}
                </p>
              </div>
              <span className="tabular-nums">${(item.qty * item.price).toFixed(2)}</span>
            </li>
          ))
        )}
      </ul>

      <label className="mb-4 block text-sm">
        <span className="mb-1 flex items-center gap-1.5 font-medium">
          <ScrollText className="size-3.5" />
          Order note
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Allergy, rush, guest request…"
          className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <Button
          variant="outline"
          className="mt-2 h-8 text-xs"
          disabled={busy}
          onClick={() => onSaveNote(note)}
        >
          Save note
        </Button>
      </label>

      {canGiveToDelivery ? (
        <Button
          className="mb-3 w-full gap-2"
          disabled={busy}
          onClick={onGiveToDelivery}
        >
          <Truck className="size-4" />
          Give to Delivery
        </Button>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button className="gap-2" disabled={busy || order.items.length === 0} onClick={onSendKitchen}>
          <CookingPot className="size-4" />
          Kitchen
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy || order.items.length === 0}
          onClick={onPrintKitchen}
        >
          <Printer className="size-4" />
          Chit
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy || order.items.length === 0}
          onClick={onPrintInvoice}
        >
          <FileText className="size-4" />
          Invoice
        </Button>
      </div>
    </FormDialog>
  );
}
