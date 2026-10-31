import { Button, FormDialog } from "@zatgo/ui";
import { FileText, Printer } from "@zatgo/icons";
import type { PaymentRecord } from "@/lib/pos-repo";
import { money } from "@/lib/money";
import { posRepo } from "@/lib/pos-repo";

export function InvoicesHubDialog({
  open,
  payments,
  onClose,
  onViewReceipt,
  onViewInvoice,
  canOpen,
}: {
  open: boolean;
  payments: PaymentRecord[];
  onClose: () => void;
  onViewReceipt: (payment: PaymentRecord) => void;
  onViewInvoice: (payment: PaymentRecord) => void;
  /** False hides the view buttons (e.g. retail invoices sold before this session). */
  canOpen?: (payment: PaymentRecord) => boolean;
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
                  <td className="px-3 py-2.5 font-medium">
                    #{payment.orderNumber}
                    {posRepo.pendingSyncRef(payment.orderId) ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                        Pending sync
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 capitalize">{payment.method}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(payment.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                    {new Date(payment.paidAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      {canOpen && !canOpen(payment) ? (
                        <span className="text-xs text-[var(--color-muted-foreground)]">View on the site</span>
                      ) : (
                        <>
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
                        </>
                      )}
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
