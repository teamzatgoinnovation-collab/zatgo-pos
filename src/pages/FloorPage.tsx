import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, cn } from "@zatgo/ui";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/pos/ConfirmDialog";
import { TableDetailDialog } from "@/components/pos/TableDetailDialog";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import {
  posRepo,
  type OrderRecord,
  type TableRecord,
  type TableStatus,
} from "@/lib/pos-repo";

const statusBg: Record<TableStatus, string> = {
  free: "bg-[var(--pos-floor-free)]",
  occupied: "bg-[var(--pos-floor-occupied)]",
  billing: "bg-[var(--pos-floor-billing)]",
};

export function FloorPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [seatTable, setSeatTable] = useState<TableRecord | null>(null);
  const [detailTable, setDetailTable] = useState<TableRecord | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderRecord | null>(null);
  const [clearTable, setClearTable] = useState<TableRecord | null>(null);
  const [covers, setCovers] = useState(2);

  const { data = [] } = useQuery({
    queryKey: ["pos", "tables"],
    queryFn: () => posRepo.listTables(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const openTableDetail = async (table: TableRecord) => {
    setDetailTable(table);
    if (table.orderId) {
      try {
        const order = await posRepo.getOrder(table.orderId);
        setDetailOrder(order);
      } catch {
        setDetailOrder(null);
      }
    } else {
      setDetailOrder(null);
    }
  };

  const seat = useMutation({
    mutationFn: async () => {
      if (!seatTable) throw new Error("No table");
      return posRepo.seatTable(seatTable.id, covers);
    },
    onSuccess: (order) => {
      invalidate();
      toast.success(`Seated ${seatTable?.name}`);
      setSeatTable(null);
      setDetailTable(null);
      navigate("/orders");
      void order;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: (tableId: string) => posRepo.setTableStatus(tableId, "free"),
    onSuccess: () => {
      invalidate();
      setClearTable(null);
      setDetailTable(null);
      setDetailOrder(null);
      toast.success("Table cleared");
    },
  });

  const requestBill = useMutation({
    mutationFn: (orderId: string) => posRepo.markBilling(orderId),
    onSuccess: async () => {
      invalidate();
      toast.success("Table marked for billing");
      if (detailTable) {
        const tables = await posRepo.listTables();
        const fresh = tables.find((t) => t.id === detailTable.id);
        if (fresh) await openTableDetail(fresh);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zones = [...new Set(data.map((t) => t.zone))];

  return (
    <div>
      <PageHeader
        title="Floor"
        description="Tap a table for actions — seat, open order, request bill, or clear."
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-[var(--color-muted-foreground)]">
        {(["free", "occupied", "billing"] as TableStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 capitalize">
            <span className={cn("inline-block size-3 rounded-sm", statusBg[s])} />
            {s}
          </span>
        ))}
      </div>

      <div className="space-y-6">
        {zones.map((zone) => (
          <section key={zone}>
            <h2 className="mb-3 text-sm font-medium text-[var(--color-muted-foreground)]">
              {zone}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {data
                .filter((t) => t.zone === zone)
                .map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => void openTableDetail(table)}
                    className={cn(
                      "rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-left transition-opacity hover:opacity-95",
                      statusBg[table.status],
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xl font-semibold">{table.name}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {table.seats} seats
                          {table.covers ? ` · ${table.covers} covers` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-medium capitalize">{table.status}</span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                      Tap for table modal
                    </p>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      <TableDetailDialog
        open={Boolean(detailTable)}
        table={detailTable}
        order={detailOrder}
        total={detailOrder ? posRepo.orderTotal(detailOrder) : 0}
        busy={seat.isPending || clear.isPending || requestBill.isPending}
        onClose={() => {
          setDetailTable(null);
          setDetailOrder(null);
        }}
        onSeat={() => {
          if (!detailTable) return;
          setSeatTable(detailTable);
          setCovers(Math.min(2, detailTable.seats));
          setDetailTable(null);
        }}
        onOpenOrders={() => {
          navigate("/orders");
        }}
        onRequestBill={() => detailOrder && requestBill.mutate(detailOrder.id)}
        onClear={() => detailTable && setClearTable(detailTable)}
      />

      <FormDialog
        open={!!seatTable}
        title={seatTable ? `Seat ${seatTable.name}` : "Seat"}
        onClose={() => setSeatTable(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setSeatTable(null)}>
              Cancel
            </Button>
            <Button onClick={() => seat.mutate()} disabled={seat.isPending}>
              Open order
            </Button>
          </>
        }
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Covers</span>
          <input
            type="number"
            min={1}
            max={seatTable?.seats ?? 12}
            className="h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 outline-none focus:border-[var(--color-primary)]"
            value={covers}
            onChange={(e) => setCovers(Number(e.target.value))}
          />
        </label>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(clearTable)}
        title="Clear table?"
        description={
          clearTable
            ? `Clear ${clearTable.name}? This frees the table without voiding the order record.`
            : ""
        }
        confirmLabel="Clear table"
        danger
        busy={clear.isPending}
        onClose={() => setClearTable(null)}
        onConfirm={() => clearTable && clear.mutate(clearTable.id)}
      />
    </div>
  );
}
