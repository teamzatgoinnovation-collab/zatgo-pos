import { Button } from "@zatgo/ui";
import { FileText, Printer } from "@zatgo/icons";
import { FormDialog } from "@/components/FormDialog";
import type { PaymentRecord } from "@/lib/pos-repo";

export function InvoicesHubDialog({
  open,
  payments,
  onClose,
  onViewReceipt,
  onViewInvoice,
}: {
  open: boolean;
  payments: PaymentRecord[];
  onClose: () => void;
  onViewReceipt: (payment: PaymentRecord) => void;
  onViewInvoice: (payment: PaymentRecord) => void;
}) {
  return (
    <FormDialog
      open={open}
      title="Invoices & receipts"
      description="Recent paid sales — open as receipt or tax invoice."
      onClose={onClose}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {payments.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No payments yet</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Paid</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="px-3 py-2.5 font-medium">#{payment.orderNumber}</td>
                  <td className="px-3 py-2.5 capitalize">{payment.method}</td>
                  <td className="px-3 py-2.5 tabular-nums">${payment.amount.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                    {new Date(payment.paidAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => onViewReceipt(payment)}
                      >
                        <Printer className="size-3.5" />
                        Receipt
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => onViewInvoice(payment)}
                      >
                        <FileText className="size-3.5" />
                        Invoice
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormDialog>
  );
}
