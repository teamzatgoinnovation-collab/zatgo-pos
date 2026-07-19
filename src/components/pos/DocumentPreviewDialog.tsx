import { Button, FormDialog } from "@zatgo/ui";
import { FileText, Printer } from "@zatgo/icons";
import { useState } from "react";
import { toast } from "sonner";
import { openCashDrawerIfNeeded, printPosDocument } from "@/lib/print";
import type { DocumentKind, PosDocument } from "@/lib/pos-document";
import { ReceiptDocument } from "./ReceiptDocument";

export function DocumentPreviewDialog({
  open,
  document,
  onClose,
  onKindChange,
  allowKindToggle = false,
}: {
  open: boolean;
  document: PosDocument | null;
  onClose: () => void;
  onKindChange?: (kind: DocumentKind) => void;
  allowKindToggle?: boolean;
}) {
  const [printing, setPrinting] = useState(false);

  if (!document) return null;

  const onPrint = async () => {
    setPrinting(true);
    try {
      const result = await printPosDocument(document);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (document.paymentMethod) {
        await openCashDrawerIfNeeded(document.paymentMethod);
      }
      toast.success("Sent to printer");
    } finally {
      setPrinting(false);
    }
  };

  const title =
    document.kind === "kitchen"
      ? "Kitchen ticket"
      : document.kind === "invoice"
        ? "Invoice"
        : "Receipt";

  return (
    <FormDialog
      open={open}
      title={title}
      onClose={onClose}
      className={document.kind === "invoice" ? "max-w-2xl" : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button className="gap-2" disabled={printing} onClick={() => void onPrint()}>
            <Printer className="size-4" />
            {printing ? "Printing…" : "Print"}
          </Button>
        </>
      }
    >
      {allowKindToggle && onKindChange && document.kind !== "kitchen" ? (
        <div className="mb-4 flex gap-2">
          <Button
            variant={document.kind === "receipt" ? "default" : "outline"}
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => onKindChange("receipt")}
          >
            <Printer className="size-3.5" />
            Receipt
          </Button>
          <Button
            variant={document.kind === "invoice" ? "default" : "outline"}
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => onKindChange("invoice")}
          >
            <FileText className="size-3.5" />
            Invoice
          </Button>
        </div>
      ) : null}

      <div className="max-h-[60vh] overflow-auto rounded-[var(--radius-lg)] bg-[var(--color-muted)] p-4">
        <ReceiptDocument doc={document} />
      </div>
    </FormDialog>
  );
}
