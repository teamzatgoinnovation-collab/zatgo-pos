import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@zatgo/ui";
import { FileText, Printer } from "@zatgo/icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DocumentPreviewDialog } from "@/components/pos/DocumentPreviewDialog";
import { posRepo, type OrderRecord, type PaymentRecord } from "@/lib/pos-repo";
import { openCashDrawerIfNeeded, printPosDocument } from "@/lib/print";
import { buildSaleDocument, type DocumentKind, type PosDocument } from "@/lib/pos-document";
import { useBusinessStore } from "@/store/business";
import { useLastSaleStore } from "@/store/last-sale";
import { usePrinterStore } from "@/store/printer";

export function BillingPage() {
  const qc = useQueryClient();
  const profile = useBusinessStore((s) => s.profile);
  const [method, setMethod] = useState<PaymentRecord["method"]>("card");
  const [preview, setPreview] = useState<PosDocument | null>(null);
  const setLastDocument = useLastSaleStore((s) => s.setDocument);
  const autoPrintReceipt = usePrinterStore((s) => s.autoPrintReceipt);

  const { data: orders = [] } = useQuery({
    queryKey: ["pos", "orders"],
    queryFn: () => posRepo.listOrders(),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["pos", "payments"],
    queryFn: () => posRepo.listPayments(),
  });

  const billable = useMemo(
    () => orders.filter((o) => o.status === "ready" || o.status === "sent" || o.status === "open"),
    [orders],
  );

  const showDoc = async (doc: PosDocument, autoPrint: boolean) => {
    setLastDocument(doc);
    setPreview(doc);
    if (autoPrint) {
      const result = await printPosDocument(doc);
      if (result.ok) {
        await openCashDrawerIfNeeded(doc.paymentMethod ?? "");
        toast.success("Printed");
      } else {
        toast.error(result.message);
      }
    }
  };

  const markBilling = useMutation({
    mutationFn: (orderId: string) => posRepo.markBilling(orderId),
    onSuccess: async (_table, orderId) => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("Table marked for billing");
      const order = await posRepo.getOrder(orderId);
      const doc = buildSaleDocument({ kind: "invoice", profile, order });
      setPreview(doc);
    },
  });

  const previewInvoice = async (order: OrderRecord) => {
    const doc = buildSaleDocument({ kind: "invoice", profile, order });
    setPreview(doc);
  };

  const pay = useMutation({
    mutationFn: (orderId: string) => posRepo.payOrder(orderId, method),
    onSuccess: async ({ payment, order }) => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success(`Paid $${payment.amount.toFixed(2)} via ${payment.method}`);
      const doc = buildSaleDocument({
        kind: "receipt",
        profile,
        order: { ...order, status: "paid" },
        payment,
      });
      await showDoc(doc, autoPrintReceipt);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprintPayment = async (payment: PaymentRecord) => {
    try {
      const order = await posRepo.getOrder(payment.orderId);
      const doc = buildSaleDocument({
        kind: "receipt",
        profile,
        order,
        payment,
      });
      setPreview(doc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load receipt");
    }
  };

  const payColumns = useMemo<ColumnDef<PaymentRecord>[]>(
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
        header: "Paid at",
        cell: ({ row }) => new Date(row.original.paidAt).toLocaleString(),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => void reprintPayment(row.original)}
          >
            <Printer className="size-3.5" />
            Reprint
          </Button>
        ),
      },
    ],
    [profile],
  );

  const onKindChange = (kind: DocumentKind) => {
    if (!preview || kind === "kitchen") return;
    setPreview({
      ...preview,
      kind,
      subtitle: kind === "invoice" ? "Tax invoice / guest check" : "Sales receipt",
      footerNote:
        kind === "invoice"
          ? "Thank you for dining with us. Please retain this invoice."
          : "Thank you for your purchase.",
    });
  };

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Close checks, print guest invoices, and reprint receipts."
        actions={
          <select
            className="h-9 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentRecord["method"])}
          >
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="wallet">Wallet</option>
          </select>
        }
      />

      <div className="mb-8 space-y-2">
        <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">Open checks</h2>
        {billable.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No open checks</p>
        ) : (
          billable.map((order) => (
            <BillRow
              key={order.id}
              order={order}
              onInvoice={() => void previewInvoice(order)}
              onBilling={() => markBilling.mutate(order.id)}
              onPay={() => pay.mutate(order.id)}
              busy={pay.isPending || markBilling.isPending}
            />
          ))
        )}
      </div>

      <h2 className="mb-3 text-sm font-medium text-[var(--color-muted-foreground)]">
        Recent payments
      </h2>
      <DataTable data={payments} columns={payColumns} emptyMessage="No payments yet" />

      <DocumentPreviewDialog
        open={Boolean(preview)}
        document={preview}
        onClose={() => setPreview(null)}
        allowKindToggle
        onKindChange={onKindChange}
      />
    </div>
  );
}

function BillRow({
  order,
  onInvoice,
  onBilling,
  onPay,
  busy,
}: {
  order: OrderRecord;
  onInvoice: () => void;
  onBilling: () => void;
  onPay: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3">
      <div>
        <p className="font-medium">
          #{order.number} · {order.tableName}
        </p>
        <p className="text-sm text-[var(--color-muted-foreground)] capitalize">
          {order.status} · {order.items.length} lines · ${posRepo.orderTotal(order).toFixed(2)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-8 gap-1 text-xs" onClick={onInvoice} disabled={busy}>
          <FileText className="size-3.5" />
          Invoice
        </Button>
        <Button variant="outline" className="h-8 text-xs" onClick={onBilling} disabled={busy}>
          Request bill
        </Button>
        <Button className="h-8 text-xs" onClick={onPay} disabled={busy || order.items.length === 0}>
          Take payment
        </Button>
      </div>
    </div>
  );
}
