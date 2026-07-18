import { cn } from "@zatgo/ui";
import type { PosDocument } from "@/lib/pos-document";

export function ReceiptDocument({
  doc,
  className,
}: {
  doc: PosDocument;
  className?: string;
}) {
  const isKitchen = doc.kind === "kitchen";
  const isInvoice = doc.kind === "invoice";

  return (
    <div
      className={cn(
        "mx-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white text-black shadow-sm",
        isInvoice ? "max-w-xl p-6 font-sans text-sm" : "max-w-[280px] p-4 font-mono text-xs",
        className,
      )}
    >
      <div className="text-center">
        <p className={cn("font-semibold", isInvoice ? "text-lg" : "text-sm")}>
          {doc.businessName}
        </p>
        {doc.subtitle ? (
          <p className="mt-0.5 text-[11px] text-neutral-600">{doc.subtitle}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-neutral-600">
          #{doc.number} · {new Date(doc.issuedAt).toLocaleString()}
        </p>
        {doc.tableName ? (
          <p className="text-[11px] text-neutral-600">
            {doc.tableName}
            {doc.server ? ` · ${doc.server}` : ""}
            {doc.channel ? ` · ${doc.channel.replaceAll("_", " ")}` : ""}
          </p>
        ) : null}
        {doc.customerName ? (
          <p className="text-[11px] text-neutral-600">
            Customer: {doc.customerName}
            {doc.customerPhone ? ` · ${doc.customerPhone}` : ""}
          </p>
        ) : null}
        {doc.deliveryAddress ? (
          <p className="text-[11px] text-neutral-600">
            Deliver to: {doc.deliveryAddress}
            {doc.deliveryPhone ? ` · ${doc.deliveryPhone}` : ""}
          </p>
        ) : null}
        {doc.deliveryBoyName ? (
          <p className="text-[11px] text-neutral-600">
            Courier: {doc.deliveryBoyName}
          </p>
        ) : null}
      </div>

      <div className="my-3 border-t border-dashed border-neutral-400" />

      <ul className="space-y-2">
        {doc.lines.length === 0 ? (
          <li className="text-neutral-500">No lines</li>
        ) : (
          doc.lines.map((line, idx) => (
            <li key={`${line.name}-${idx}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="leading-snug">
                  {isKitchen ? <strong>{line.qty}× </strong> : null}
                  {line.name}
                </p>
                {line.extras ? (
                  <p className="text-[11px] text-neutral-600">+ {line.extras}</p>
                ) : null}
                {!isKitchen ? (
                  <p className="text-[11px] text-neutral-600">
                    {line.qty} × ${line.unitPrice.toFixed(2)}
                  </p>
                ) : null}
                {line.meta ? (
                  <p className="text-[11px] capitalize text-neutral-500">{line.meta}</p>
                ) : null}
              </div>
              {!isKitchen ? (
                <span className="tabular-nums">${line.total.toFixed(2)}</span>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {!isKitchen ? (
        <>
          <div className="my-3 border-t border-dashed border-neutral-400" />
          <div className="space-y-1">
            <Row label="Subtotal" value={`$${doc.subtotal.toFixed(2)}`} />
            {doc.discount > 0 ? (
              <Row label="Discount" value={`−$${doc.discount.toFixed(2)}`} />
            ) : null}
            <Row label="Tax" value={`$${doc.tax.toFixed(2)}`} />
            <Row label="Total" value={`$${doc.total.toFixed(2)}`} strong />
            {doc.paymentMethod ? (
              <Row label="Paid" value={doc.paymentMethod} capitalize />
            ) : null}
            {doc.cashTendered !== undefined ? (
              <Row label="Tendered" value={`$${doc.cashTendered.toFixed(2)}`} />
            ) : null}
            {doc.changeDue !== undefined ? (
              <Row label="Change" value={`$${doc.changeDue.toFixed(2)}`} />
            ) : null}
          </div>
        </>
      ) : (
        <div className="my-3 border-t border-dashed border-neutral-400" />
      )}

      {doc.footerNote ? (
        <p className="mt-4 text-center text-[11px] text-neutral-600">{doc.footerNote}</p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  capitalize,
}: {
  label: string;
  value: string;
  strong?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        strong && "text-sm font-semibold",
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", capitalize && "capitalize")}>{value}</span>
    </div>
  );
}
