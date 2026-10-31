import { Button, FormDialog } from "@zatgo/ui";
import { FileText, Printer } from "@zatgo/icons";
import { useState } from "react";
import { toast } from "sonner";
import { activePaper, openCashDrawerIfNeeded, printPosDocument } from "@/lib/print";
import { usePrinterStore } from "@/store/printer";
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
  const devicePaper = usePrinterStore((s) => s.paper);
  const setPaper = usePrinterStore((s) => s.setPaper);

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
      className={document.kind !== "kitchen" && activePaper(document) === "a4" ? "max-w-4xl" : "max-w-md"}
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

      {document.kind !== "kitchen" ? (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-[var(--color-muted-foreground)]">Paper</span>
          {(["80mm", "a4"] as const).map((p) => (
            <Button
              key={p}
              variant={activePaper(document) === p ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => setPaper(p)}
            >
              {p === "a4" ? "A4" : "80 mm"}
            </Button>
          ))}
          {devicePaper ? (
            <button type="button" className="text-[var(--color-muted-foreground)] underline" onClick={() => setPaper(null)}>
              use site default
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-[70vh] overflow-auto rounded-[var(--radius-lg)] bg-[var(--color-muted)] p-4">
        <ReceiptDocument doc={document} />
      </div>
    </FormDialog>
  );
}
