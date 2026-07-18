import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { posRepo, type PaymentRecord } from "@/lib/pos-repo";

export function ReportsPage() {
  const { data: payments = [] } = useQuery({
    queryKey: ["pos", "payments"],
    queryFn: () => posRepo.listPayments(),
  });
  const { data: counts } = useQuery({
    queryKey: ["pos", "counts"],
    queryFn: () => posRepo.counts(),
  });

  const byMethod = useMemo(() => {
    const map = { cash: 0, card: 0, wallet: 0 };
    for (const p of payments) map[p.method] += p.amount;
    return map;
  }, [payments]);

  const columns = useMemo<ColumnDef<PaymentRecord>[]>(
    () => [
      { accessorKey: "orderNumber", header: "Order" },
      { accessorKey: "method", header: "Method" },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => `$${row.original.amount.toFixed(2)}`,
      },
      {
        accessorKey: "paidAt",
        header: "When",
        cell: ({ row }) => new Date(row.original.paidAt).toLocaleString(),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Shift sales snapshot from mock payments. Wire to resto_pos reporting later."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Payments (mock)" value={String(payments.length)} />
        <Stat label="Cash" value={`$${byMethod.cash.toFixed(2)}`} />
        <Stat label="Card" value={`$${byMethod.card.toFixed(2)}`} />
        <Stat label="Open tickets" value={String(counts?.openOrders ?? "—")} />
      </div>

      <DataTable data={payments} columns={columns} emptyMessage="No settled checks yet" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
