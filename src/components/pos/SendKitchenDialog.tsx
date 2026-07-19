import { Button, FormDialog } from "@zatgo/ui";
import { CookingPot } from "@zatgo/icons";
import type { OrderRecord } from "@/lib/pos-repo";
import { formatExtras } from "@/lib/extras";

export function SendKitchenDialog({
  open,
  order,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: OrderRecord | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!order) return null;

  const fireable = order.items.filter((i) => i.status === "queued" || i.status === "preparing");
  const lines = fireable.length ? fireable : order.items;

  return (
    <FormDialog
      open={open}
      title={`Send #${order.number} to kitchen`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={onConfirm} disabled={busy || order.items.length === 0}>
            <CookingPot className="size-4" />
            {busy ? "Sending…" : "Fire to KDS"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
        {order.tableName} · {order.covers} covers · {order.server}
        {order.note ? ` · Note: ${order.note}` : ""}
      </p>

      <ul className="max-h-[40vh] space-y-2 overflow-auto">
        {lines.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium">
                {item.qty}× {item.name}
              </span>
              <span className="text-xs capitalize text-[var(--color-muted-foreground)]">
                {item.station}
              </span>
            </div>
            {item.extras?.length ? (
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {formatExtras(item.extras)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}
