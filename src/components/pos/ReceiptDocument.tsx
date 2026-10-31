import { useMemo } from "react";
import { cn } from "@zatgo/ui";
import { documentToHtml, type PosDocument } from "@/lib/pos-document";
import type { Paper } from "@/lib/invoice-html";
import { activePaper } from "@/lib/print";

/** The preview is the printable HTML itself (one markup for screen and printer), shown at the paper's width. */
export function ReceiptDocument({
  doc,
  paper,
  className,
}: {
  doc: PosDocument;
  paper?: Paper;
  className?: string;
}) {
  const size = paper ?? activePaper(doc);
  const html = useMemo(() => documentToHtml(doc, size), [doc, size]);
  return (
    <iframe
      title="Document preview"
      srcDoc={html}
      sandbox=""
      className={cn(
        "mx-auto block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white shadow-sm",
        size === "a4" ? "h-[70vh] w-full max-w-[794px]" : "h-[60vh] w-[320px]",
        className,
      )}
    />
  );
}
