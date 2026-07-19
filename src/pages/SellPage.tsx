import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, FormDialog } from "@zatgo/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BarcodeScanField } from "@/components/pos/BarcodeScanField";
import { CartPanel } from "@/components/pos/CartPanel";
import { CategoryChips } from "@/components/pos/CategoryChips";
import { ConfirmDialog } from "@/components/pos/ConfirmDialog";
import { DocumentPreviewDialog } from "@/components/pos/DocumentPreviewDialog";
import { ExtraPickerDialog } from "@/components/pos/ExtraPickerDialog";
import { FloorHubDialog } from "@/components/pos/FloorHubDialog";
import { HeldHubDialog } from "@/components/pos/HeldHubDialog";
import { HeldSalesBar } from "@/components/pos/HeldSalesBar";
import { InvoiceCheckoutDialog } from "@/components/pos/InvoiceCheckoutDialog";
import { InvoicesHubDialog } from "@/components/pos/InvoicesHubDialog";
import { KdsHubDialog } from "@/components/pos/KdsHubDialog";
import { KdsTicketDialog } from "@/components/pos/KdsTicketDialog";
import { OrderDetailDialog } from "@/components/pos/OrderDetailDialog";
import { OrdersHubDialog } from "@/components/pos/OrdersHubDialog";
import { PosActionBar, type PosHubId } from "@/components/pos/PosActionBar";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { SendKitchenDialog } from "@/components/pos/SendKitchenDialog";
import { TableDetailDialog } from "@/components/pos/TableDetailDialog";
import {
  posRepo,
  type KdsTicket,
  type OrderRecord,
  type PaymentRecord,
  type ProductRecord,
  type SelectedExtra,
  type TableRecord,
} from "@/lib/pos-repo";
import { openCashDrawerIfNeeded, printPosDocument } from "@/lib/print";
import { lineUnitPrice } from "@/lib/extras";
import {
  buildKitchenDocument,
  buildSaleDocument,
  type DocumentKind,
  type PosDocument,
} from "@/lib/pos-document";
import { useHasFeature } from "@/hooks/useHasFeature";
import { hasFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";
import {
  cartPricing,
  invoiceMetaToCheckout,
  useCartStore,
  validateInvoiceMeta,
} from "@/store/cart";
import { useLastSaleStore } from "@/store/last-sale";
import { usePrinterStore } from "@/store/printer";

export function SellPage() {
  const profile = useBusinessStore((s) => s.profile);
  const verticalId = useBusinessStore((s) => s.verticalId);
  const showOrders = useHasFeature("orders");
  const showKds = useHasFeature("kds");
  const showFloor = useHasFeature("floor");
  const qc = useQueryClient();
  const [scan, setScan] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [preview, setPreview] = useState<PosDocument | null>(null);
  const [extraProduct, setExtraProduct] = useState<ProductRecord | null>(null);
  const [hub, setHub] = useState<PosHubId | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [ticket, setTicket] = useState<KdsTicket | null>(null);
  const [table, setTable] = useState<TableRecord | null>(null);
  const [tableOrder, setTableOrder] = useState<OrderRecord | null>(null);
  const [seatTable, setSeatTable] = useState<TableRecord | null>(null);
  const [covers, setCovers] = useState(2);
  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [clearTable, setClearTable] = useState<TableRecord | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const lines = useCartStore((s) => s.lines);
  const method = useCartStore((s) => s.method);
  const cashTendered = useCartStore((s) => s.cashTendered);
  const discountType = useCartStore((s) => s.discountType);
  const discountValue = useCartStore((s) => s.discountValue);
  const taxRate = useCartStore((s) => s.taxRate);
  const invoice = useCartStore((s) => s.invoice);
  const held = useCartStore((s) => s.held);
  const add = useCartStore((s) => s.add);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const hold = useCartStore((s) => s.hold);
  const resume = useCartStore((s) => s.resume);
  const discardHeld = useCartStore((s) => s.discardHeld);
  const setMethod = useCartStore((s) => s.setMethod);
  const setCashTendered = useCartStore((s) => s.setCashTendered);
  const setDiscount = useCartStore((s) => s.setDiscount);
  const setTaxRate = useCartStore((s) => s.setTaxRate);
  const setSaleType = useCartStore((s) => s.setSaleType);
  const setInvoice = useCartStore((s) => s.setInvoice);
  const qtyOf = useCartStore((s) => s.qtyOf);

  const lastDocument = useLastSaleStore((s) => s.document);
  const setLastDocument = useLastSaleStore((s) => s.setDocument);
  const autoPrintReceipt = usePrinterStore((s) => s.autoPrintReceipt);

  const pricing = useMemo(
    () => cartPricing(lines, discountType, discountValue, taxRate),
    [lines, discountType, discountValue, taxRate],
  );

  const {
    data: catalog = [],
    error: catalogError,
    isError: catalogFailed,
  } = useQuery({
    queryKey: ["pos", "products", verticalId],
    queryFn: () => posRepo.listProducts(verticalId),
    retry: 1,
  });

  useEffect(() => {
    if (!catalogFailed || !catalogError) return;
    toast.error(
      catalogError instanceof Error
        ? catalogError.message
        : "Failed to load catalog from ERPNext",
    );
  }, [catalogFailed, catalogError]);

  const { data: orders = [] } = useQuery({
    queryKey: ["pos", "orders"],
    queryFn: () => posRepo.listOrders(),
    enabled: showOrders,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["pos", "payments"],
    queryFn: () => posRepo.listPayments(),
  });

  const { data: kdsTickets = [] } = useQuery({
    queryKey: ["pos", "kds"],
    queryFn: () => posRepo.listKdsTickets(),
    enabled: showKds,
    refetchInterval: hub === "kds" ? 5_000 : false,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["pos", "tables"],
    queryFn: () => posRepo.listTables(),
    enabled: showFloor,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos", "customers"],
    queryFn: () => posRepo.listCustomers(),
  });

  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== "paid" && o.status !== "void"),
    [orders],
  );

  const categories = useMemo(
    () => ["all", ...new Set(catalog.map((p) => p.category))],
    [catalog],
  );

  const visible = useMemo(() => {
    const q = scan.trim().toLowerCase();
    return catalog.filter((p) => {
      if (!p.available) return false;
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    });
  }, [catalog, category, scan]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pos"] });

  const commitProduct = (product: ProductRecord, extras: SelectedExtra[] = []) => {
    if (product.requiresPrescription && hasFeature(profile, "prescriptions")) {
      toast.message("Prescription item — confirm Rx on hand before handing over.");
    }
    add(product, extras);
  };

  const addProduct = (product: ProductRecord) => {
    if (product.extras?.length) {
      setExtraProduct(product);
      return;
    }
    commitProduct(product);
  };

  const onScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const found = await posRepo.findByBarcode(code, verticalId);
    if (!found) {
      toast.error("No match for barcode / SKU");
      return;
    }
    if (found.extras?.length) setExtraProduct(found);
    else commitProduct(found);
    setScan("");
    scanRef.current?.focus();
  };

  const onHold = () => {
    const sale = hold();
    if (!sale) {
      toast.message("Cart is empty");
      return;
    }
    toast.success(`${sale.label} parked`);
    scanRef.current?.focus();
  };

  /** Preview immediately; print in background so checkout UI never sticks on printer hang. */
  const presentSale = (doc: PosDocument) => {
    setLastDocument(doc);
    setPreview(doc);
    if (!autoPrintReceipt) return;
    void (async () => {
      const result = await printPosDocument(doc);
      if (result.ok) {
        await openCashDrawerIfNeeded(doc.paymentMethod ?? "");
        toast.success("Receipt printed");
      } else {
        toast.error(result.message);
      }
    })();
  };

  const checkout = useMutation({
    mutationFn: () => {
      const metaError = validateInvoiceMeta(invoice);
      if (metaError) throw new Error(metaError);
      const tendered = Number.parseFloat(cashTendered);
      return posRepo
        .checkoutWalkIn(
          lines.map((l) => ({
            productId: l.product.id,
            name: l.product.name,
            price: lineUnitPrice(l.product.price, l.extras),
            station: l.product.station,
            qty: l.qty,
            extras: l.extras,
          })),
          method,
          verticalId,
          {
            amount: pricing.total,
            discount: pricing.discount,
            tax: pricing.tax,
          },
          invoiceMetaToCheckout(invoice),
        )
        .then((result) => ({
          ...result,
          cashTendered: Number.isFinite(tendered) ? tendered : undefined,
          pricingSnapshot: { ...pricing },
        }));
    },
    onSuccess: ({ order: saleOrder, payment, cashTendered: tendered, pricingSnapshot }) => {
      // Keep this sync — TanStack Query awaits onSuccess before clearing isPending.
      invalidate();
      setInvoiceOpen(false);
      toast.success(
        saleOrder.channel === "delivery" && saleOrder.delivery?.deliveryBoyName
          ? `Invoice #${payment.orderNumber} · $${payment.amount.toFixed(2)} → ${saleOrder.delivery.deliveryBoyName}`
          : `Invoice #${payment.orderNumber} · $${payment.amount.toFixed(2)}`,
      );
      clear();
      const doc = buildSaleDocument({
        kind: "invoice",
        profile,
        order: saleOrder,
        payment,
        pricing: {
          subtotal: pricingSnapshot.subtotal,
          discount: pricingSnapshot.discount,
          tax: pricingSnapshot.tax,
          total: pricingSnapshot.total,
        },
        cashTendered: tendered,
      });
      presentSale(doc);
      scanRef.current?.focus();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const beginInvoice = () => {
    if (lines.length === 0) return;
    setInvoiceOpen(true);
  };

  const send = useMutation({
    mutationFn: (orderId: string) => posRepo.sendOrder(orderId),
    onSuccess: () => {
      invalidate();
      setSendOpen(false);
      toast.success("Sent to kitchen");
    },
  });

  const saveNote = useMutation({
    mutationFn: ({ orderId, note }: { orderId: string; note: string }) =>
      posRepo.setOrderNote(orderId, note),
    onSuccess: (updated) => {
      invalidate();
      setOrder(updated);
      toast.success("Note saved");
    },
  });

  const voidOrder = useMutation({
    mutationFn: (orderId: string) => posRepo.voidOrder(orderId),
    onSuccess: () => {
      invalidate();
      setVoidOpen(false);
      setOrder(null);
      toast.success("Order voided");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToDelivery = useMutation({
    mutationFn: (orderId: string) => posRepo.giveToDelivery(orderId),
    onSuccess: (updated) => {
      invalidate();
      setOrder(null);
      toast.success(`Order #${updated.number} given to Delivery`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: (itemId: string) => posRepo.advanceKdsItem(itemId),
    onSuccess: (item) => {
      invalidate();
      setTicket((prev) =>
        prev && prev.id === item.id ? { ...prev, status: item.status } : prev,
      );
      toast.success(`${item.name} → ${item.status}`);
      if (item.status === "served") setTicket(null);
    },
  });

  const recall = useMutation({
    mutationFn: (itemId: string) => posRepo.recallKdsItem(itemId),
    onSuccess: (item) => {
      invalidate();
      setTicket((prev) =>
        prev && prev.id === item.id ? { ...prev, status: item.status } : prev,
      );
      toast.success(`Recalled ${item.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seat = useMutation({
    mutationFn: async () => {
      if (!seatTable) throw new Error("No table");
      return posRepo.seatTable(seatTable.id, covers);
    },
    onSuccess: async (opened) => {
      invalidate();
      toast.success(`Seated ${seatTable?.name}`);
      setSeatTable(null);
      setHub(null);
      setOrder(opened);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearTbl = useMutation({
    mutationFn: (tableId: string) => posRepo.setTableStatus(tableId, "free"),
    onSuccess: () => {
      invalidate();
      setClearTable(null);
      setTable(null);
      setTableOrder(null);
      toast.success("Table cleared");
    },
  });

  const requestBill = useMutation({
    mutationFn: (orderId: string) => posRepo.markBilling(orderId),
    onSuccess: async () => {
      invalidate();
      toast.success("Table marked for billing");
      if (table) {
        const fresh = (await posRepo.listTables()).find((t) => t.id === table.id);
        if (fresh) await openTable(fresh);
      }
    },
  });

  const openTable = async (row: TableRecord) => {
    setTable(row);
    if (row.orderId) {
      try {
        setTableOrder(await posRepo.getOrder(row.orderId));
      } catch {
        setTableOrder(null);
      }
    } else {
      setTableOrder(null);
    }
  };

  const openPaymentDoc = async (payment: PaymentRecord, kind: "receipt" | "invoice") => {
    try {
      const paidOrder = await posRepo.getOrder(payment.orderId);
      setHub(null);
      setPreview(
        buildSaleDocument({
          kind,
          profile,
          order: paidOrder,
          payment,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load document");
    }
  };

  const printKitchen = async (target: OrderRecord) => {
    const doc = buildKitchenDocument({ profile, order: target });
    setPreview(doc);
    const result = await printPosDocument(doc);
    if (!result.ok) toast.error(result.message);
    else toast.success("Kitchen chit printed");
  };

  const onHubOpen = (id: PosHubId) => {
    if (id === "reprint") {
      if (lastDocument) setPreview(lastDocument);
      return;
    }
    setHub(id);
  };

  const verticalRef = useRef(verticalId);
  useEffect(() => {
    if (verticalRef.current !== verticalId) {
      verticalRef.current = verticalId;
      clear();
      setCategory("all");
      setScan("");
      setHub(null);
    }
    scanRef.current?.focus();
  }, [verticalId, clear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        scanRef.current?.focus();
        scanRef.current?.select();
      }
      if (e.key === "F4" && lines.length > 0) {
        e.preventDefault();
        onHold();
      }
      if (e.key === "F9" && lines.length > 0 && !checkout.isPending) {
        e.preventDefault();
        setInvoiceOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length, checkout.isPending, checkout.mutate]);

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

  const detailOrder = order;
  const busy =
    send.isPending ||
    saveNote.isPending ||
    voidOrder.isPending ||
    advance.isPending ||
    recall.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">POS</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {profile.shortLabel} — open Orders, Invoices, Kitchen & Floor from the bar
          </p>
        </div>
      </div>

      <PosActionBar
        counts={{
          orders: openOrders.length,
          invoices: payments.length,
          kds: kdsTickets.length,
          floor: tables.filter((t) => t.status !== "free").length,
        }}
        canReprint={Boolean(lastDocument)}
        heldCount={held.length}
        active={hub}
        onOpen={onHubOpen}
      />

      <HeldSalesBar
        held={held}
        onResume={(id) => {
          resume(id);
          toast.message("Held sale restored");
          scanRef.current?.focus();
        }}
        onDiscard={(id) => {
          discardHeld(id);
          toast.message("Held sale discarded");
        }}
      />

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-0 flex-col gap-3">
          <BarcodeScanField
            value={scan}
            onChange={setScan}
            onSubmit={(e) => void onScanSubmit(e)}
            inputRef={scanRef}
          />
          <CategoryChips
            categories={categories}
            value={category}
            onChange={setCategory}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ProductGrid products={visible} qtyOf={qtyOf} onAdd={addProduct} />
          </div>
        </section>

        <div className="min-h-[420px] xl:min-h-0">
          <CartPanel
            lines={lines}
            method={method}
            cashTendered={cashTendered}
            discountType={discountType}
            discountValue={discountValue}
            taxRate={taxRate}
            invoice={invoice}
            showTable={showFloor}
            charging={checkout.isPending}
            onIncrement={increment}
            onDecrement={decrement}
            onRemove={remove}
            onClear={clear}
            onHold={onHold}
            onMethodChange={setMethod}
            onCashTenderedChange={setCashTendered}
            onDiscountChange={setDiscount}
            onTaxRateChange={setTaxRate}
            onSaleType={setSaleType}
            onEditInvoice={beginInvoice}
            onCharge={beginInvoice}
          />
        </div>
      </div>

      <InvoiceCheckoutDialog
        open={invoiceOpen}
        invoice={invoice}
        customers={customers}
        tables={tables}
        showTable={showFloor}
        total={pricing.total}
        busy={checkout.isPending}
        onClose={() => setInvoiceOpen(false)}
        onChange={setInvoice}
        onConfirm={() => checkout.mutate()}
      />

      {/* Hub modals */}
      <OrdersHubDialog
        open={hub === "orders"}
        orders={openOrders}
        onClose={() => setHub(null)}
        onSelect={(row) => {
          setHub(null);
          setOrder(row);
        }}
      />

      <InvoicesHubDialog
        open={hub === "invoices"}
        payments={payments}
        onClose={() => setHub(null)}
        onViewReceipt={(p) => void openPaymentDoc(p, "receipt")}
        onViewInvoice={(p) => void openPaymentDoc(p, "invoice")}
      />

      <KdsHubDialog
        open={hub === "kds"}
        tickets={kdsTickets}
        onClose={() => setHub(null)}
        onSelect={(row) => {
          setHub(null);
          setTicket(row);
        }}
      />

      <FloorHubDialog
        open={hub === "floor"}
        tables={tables}
        onClose={() => setHub(null)}
        onSelect={(row) => {
          setHub(null);
          void openTable(row);
        }}
      />

      <HeldHubDialog
        open={hub === "held"}
        held={held}
        onClose={() => setHub(null)}
        onResume={(id) => {
          resume(id);
          setHub(null);
          toast.message("Held sale restored");
          scanRef.current?.focus();
        }}
        onDiscard={(id) => {
          discardHeld(id);
          toast.message("Held sale discarded");
        }}
      />

      {/* Detail modals */}
      <OrderDetailDialog
        open={Boolean(detailOrder)}
        order={detailOrder}
        total={detailOrder ? posRepo.orderTotal(detailOrder) : 0}
        busy={busy || giveToDelivery.isPending}
        onClose={() => setOrder(null)}
        onSendKitchen={() => setSendOpen(true)}
        onPrintKitchen={() => detailOrder && void printKitchen(detailOrder)}
        onPrintInvoice={() => {
          if (!detailOrder) return;
          setPreview(buildSaleDocument({ kind: "invoice", profile, order: detailOrder }));
        }}
        onVoid={() => setVoidOpen(true)}
        onSaveNote={(note) =>
          detailOrder && saveNote.mutate({ orderId: detailOrder.id, note })
        }
        onGiveToDelivery={() =>
          detailOrder && giveToDelivery.mutate(detailOrder.id)
        }
      />

      <SendKitchenDialog
        open={sendOpen}
        order={detailOrder}
        busy={send.isPending}
        onClose={() => setSendOpen(false)}
        onConfirm={() => detailOrder && send.mutate(detailOrder.id)}
      />

      <ConfirmDialog
        open={voidOpen}
        title="Void order?"
        description={
          detailOrder
            ? `Void #${detailOrder.number} on ${detailOrder.tableName}?`
            : "Void this order?"
        }
        confirmLabel="Void order"
        danger
        busy={voidOrder.isPending}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => detailOrder && voidOrder.mutate(detailOrder.id)}
      />

      <KdsTicketDialog
        open={Boolean(ticket)}
        ticket={ticket}
        busy={advance.isPending || recall.isPending}
        onClose={() => setTicket(null)}
        onAdvance={() => ticket && advance.mutate(ticket.id)}
        onRecall={() => ticket && recall.mutate(ticket.id)}
        onPrintOrder={() => {
          if (!ticket) return;
          void posRepo.getOrder(ticket.orderId).then((o) => printKitchen(o));
        }}
        onViewOrder={() => {
          if (!ticket) return;
          void posRepo.getOrder(ticket.orderId).then((o) => {
            setTicket(null);
            setOrder(o);
          });
        }}
      />

      <TableDetailDialog
        open={Boolean(table)}
        table={table}
        order={tableOrder}
        total={tableOrder ? posRepo.orderTotal(tableOrder) : 0}
        busy={seat.isPending || clearTbl.isPending || requestBill.isPending}
        onClose={() => {
          setTable(null);
          setTableOrder(null);
        }}
        onSeat={() => {
          if (!table) return;
          setSeatTable(table);
          setCovers(Math.min(2, table.seats));
          setTable(null);
        }}
        onOpenOrders={() => {
          if (tableOrder) {
            setTable(null);
            setOrder(tableOrder);
          }
        }}
        onRequestBill={() => tableOrder && requestBill.mutate(tableOrder.id)}
        onClear={() => table && setClearTable(table)}
      />

      <FormDialog
        open={Boolean(seatTable)}
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
        description={clearTable ? `Clear ${clearTable.name}?` : ""}
        confirmLabel="Clear table"
        danger
        busy={clearTbl.isPending}
        onClose={() => setClearTable(null)}
        onConfirm={() => clearTable && clearTbl.mutate(clearTable.id)}
      />

      <ExtraPickerDialog
        open={Boolean(extraProduct)}
        product={extraProduct}
        onClose={() => setExtraProduct(null)}
        onConfirm={(extras) => {
          if (!extraProduct) return;
          commitProduct(extraProduct, extras);
          setExtraProduct(null);
          scanRef.current?.focus();
        }}
      />

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
