import { Button, cn, FormDialog } from "@zatgo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CustomerRecord, DeliveryBoyRecord, TableRecord } from "@/lib/pos-repo";
import { posRepo } from "@/lib/pos-repo";
import {
  type CartInvoiceMeta,
  type SaleType,
  validateInvoiceMeta,
} from "@/store/cart";
import { money } from "@/lib/money";
import { useConnectivity } from "@/lib/offline/connectivity";

const inputClass =
  "mt-1 h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-primary)]";

export function InvoiceCheckoutDialog({
  open,
  invoice,
  customers,
  tables,
  showTable,
  showDelivery = true,
  total,
  busy,
  onClose,
  onChange,
  onConfirm,
}: {
  open: boolean;
  invoice: CartInvoiceMeta;
  customers: CustomerRecord[];
  tables: TableRecord[];
  showTable: boolean;
  showDelivery?: boolean;
  total: number;
  busy?: boolean;
  onClose: () => void;
  onChange: (next: CartInvoiceMeta) => void;
  onConfirm: () => void;
}) {
  const qc = useQueryClient();
  // New customers need the site (their record is created there); offline you can only pick a saved one.
  const offline = useConnectivity((s) => s.net !== "online");
  const [error, setError] = useState<string | null>(null);
  const [addingBoy, setAddingBoy] = useState(false);
  const [newBoyName, setNewBoyName] = useState("");
  const [newBoyUsername, setNewBoyUsername] = useState("");
  const [newBoyPassword, setNewBoyPassword] = useState("");
  const [newBoyPhone, setNewBoyPhone] = useState("");
  const [newBoyCode, setNewBoyCode] = useState("");

  const freeTables = useMemo(
    () => tables.filter((t) => t.status === "free" || t.id === invoice.tableId),
    [tables, invoice.tableId],
  );

  const types: { id: SaleType; label: string; hide?: boolean }[] = [
    { id: "counter", label: "Counter" },
    { id: "dine_in", label: "Table", hide: !showTable },
    { id: "delivery", label: "Delivery", hide: !showDelivery },
  ];

  const {
    data: boys = [],
    isLoading: boysLoading,
    isError: boysFailed,
    error: boysErr,
    refetch: refetchBoys,
  } = useQuery({
    queryKey: ["pos", "delivery-boys", "assignable"],
    queryFn: () => posRepo.listDeliveryBoys(),
    enabled: open && invoice.saleType === "delivery",
  });

  const boysError = boysFailed
    ? boysErr instanceof Error
      ? boysErr.message
      : "Could not load delivery boys"
    : null;

  const createBoy = useMutation({
    mutationFn: (input: {
      fullName: string;
      username: string;
      password: string;
      code?: string;
      phone?: string;
    }) => posRepo.createDeliveryBoy(input),
    onSuccess: async (boy) => {
      await qc.invalidateQueries({ queryKey: ["pos", "delivery-boys"] });
      await refetchBoys();
      patch({ deliveryBoyId: boy.id, deliveryBoyName: boy.name });
      setAddingBoy(false);
      setNewBoyName("");
      setNewBoyUsername("");
      setNewBoyPassword("");
      setNewBoyPhone("");
      setNewBoyCode("");
      toast.success(
        `Saved ${boy.name} — Delivery login ${boy.user || boy.username}`,
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create delivery boy in ERPNext");
    },
  });

  const saleType = invoice.saleType;
  const selectedBoyId = invoice.deliveryBoyId;

  useEffect(() => {
    if (!open || saleType !== "delivery") return;
    if (boysLoading || boysFailed || boys.length === 0) return;
    if (selectedBoyId && boys.some((b) => b.id === selectedBoyId)) return;
    const preferred =
      boys.find((b) => (b.status || "").toLowerCase() === "available") ??
      boys[0];
    if (!preferred) return;
    onChange({
      ...invoice,
      deliveryBoyId: preferred.id,
      deliveryBoyName: preferred.name,
    });
    // Intentionally omit full `invoice` to avoid re-running on every field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-assign when boys load
  }, [open, saleType, selectedBoyId, boys, boysLoading, boysFailed, onChange]);

  const patch = (partial: Partial<CartInvoiceMeta>) => {
    setError(null);
    onChange({ ...invoice, ...partial });
  };

  const onPickCustomer = (id: string) => {
    if (!id) {
      patch({
        customerId: null,
        customerName: "",
        customerPhone: "",
      });
      return;
    }
    const customer = customers.find((c) => c.id === id);
    if (!customer) return;
    patch({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone ?? "",
      deliveryAddress:
        invoice.saleType === "delivery" && customer.address
          ? customer.address
          : invoice.deliveryAddress,
      deliveryPhone:
        invoice.saleType === "delivery" && customer.phone
          ? customer.phone
          : invoice.deliveryPhone,
    });
  };

  const onPickBoy = (id: string) => {
    if (!id) {
      patch({ deliveryBoyId: null, deliveryBoyName: "" });
      return;
    }
    const boy = boys.find((b) => b.id === id);
    if (!boy) return;
    patch({ deliveryBoyId: boy.id, deliveryBoyName: boy.name });
  };

  const confirm = () => {
    const msg = validateInvoiceMeta(invoice);
    if (msg) {
      setError(msg);
      return;
    }
    onConfirm();
  };

  // Saves the typed name/phone as a real customer now (the sale would otherwise create it when it is charged) and selects it.
  const createCustomer = useMutation({
    mutationFn: (input: { name: string; phone?: string }) => posRepo.upsertCustomer(input),
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: ["pos", "customers"] });
      patch({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone ?? "" });
      toast.success(`Customer ${customer.name} saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onAddBoy = () => {
    const name = newBoyName.trim();
    const username = newBoyUsername.trim();
    const password = newBoyPassword;
    if (!name) {
      toast.error("Enter a delivery boy name");
      return;
    }
    if (!username) {
      toast.error("Enter a username for ERPNext login");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    createBoy.mutate({
      fullName: name,
      username,
      password,
      phone: newBoyPhone.trim() || undefined,
      code: newBoyCode.trim() || undefined,
    });
  };

  return (
    <FormDialog
      open={open}
      title="Invoice details"
      description="Set customer, table, or delivery before charging this sale."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "Charging…" : `Confirm & charge ${money(total)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
            Sale type
          </p>
          <div className="flex gap-1.5">
            {types
              .filter((t) => !t.hide)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    patch({
                      saleType: t.id,
                      ...(t.id !== "dine_in"
                        ? { tableId: null, tableName: "", covers: 1 }
                        : {}),
                      ...(t.id !== "delivery"
                        ? {
                            deliveryAddress: "",
                            deliveryPhone: "",
                            deliveryNotes: "",
                            deliveryBoyId: null,
                            deliveryBoyName: "",
                          }
                        : {}),
                    })
                  }
                  className={cn(
                    "h-9 flex-1 rounded-[var(--radius-lg)] border text-sm font-medium",
                    invoice.saleType === t.id
                      ? "border-[var(--color-primary)] bg-[var(--pos-sidebar-active)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>
        </div>

        {offline ? (
          <p className="text-xs text-amber-700">
            Offline: pick a saved customer or sell to a walk-in. New customers need a connection.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium">Customer</span>
            <select
              className={inputClass}
              value={invoice.customerId ?? ""}
              onChange={(e) => onPickCustomer(e.target.value)}
            >
              <option value="">{offline ? "Walk-in" : "Walk-in / custom"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              className={inputClass}
              value={invoice.customerName}
              disabled={offline}
              onChange={(e) =>
                patch({ customerId: null, customerName: e.target.value })
              }
              placeholder="Guest name"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone</span>
            <input
              className={inputClass}
              value={invoice.customerPhone}
              disabled={offline}
              onChange={(e) =>
                patch({ customerId: null, customerPhone: e.target.value })
              }
              placeholder="+249 …"
            />
          </label>
          {!offline && !invoice.customerId && invoice.customerName.trim() ? (
            <div className="sm:col-span-2">
              <Button
                variant="outline"
                onClick={() =>
                  createCustomer.mutate({
                    name: invoice.customerName.trim(),
                    phone: invoice.customerPhone.trim() || undefined,
                  })
                }
                disabled={createCustomer.isPending}
              >
                {createCustomer.isPending ? "Saving…" : "Save as new customer"}
              </Button>
            </div>
          ) : null}
        </div>

        {invoice.saleType === "dine_in" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <label className="block text-sm">
              <span className="font-medium">Table</span>
              <select
                className={inputClass}
                value={invoice.tableId ?? ""}
                onChange={(e) => {
                  const table = freeTables.find((t) => t.id === e.target.value);
                  patch({
                    tableId: table?.id ?? null,
                    tableName: table?.name ?? "",
                    covers: table
                      ? Math.min(invoice.covers || 1, table.seats)
                      : 1,
                  });
                }}
              >
                <option value="">Select table…</option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.zone} · {t.seats} seats
                    {t.status !== "free" ? ` (${t.status})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Covers</span>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={invoice.covers}
                onChange={(e) => patch({ covers: Number(e.target.value) || 1 })}
              />
            </label>
          </div>
        ) : null}

        {invoice.saleType === "delivery" ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Delivery address</span>
              <input
                className={inputClass}
                value={invoice.deliveryAddress}
                onChange={(e) => patch({ deliveryAddress: e.target.value })}
                placeholder="Street, area, landmarks"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Delivery phone</span>
                <input
                  className={inputClass}
                  value={invoice.deliveryPhone}
                  onChange={(e) => patch({ deliveryPhone: e.target.value })}
                  placeholder={invoice.customerPhone || "+249 …"}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Courier notes</span>
                <input
                  className={inputClass}
                  value={invoice.deliveryNotes}
                  onChange={(e) => patch({ deliveryNotes: e.target.value })}
                  placeholder="Gate, floor…"
                />
              </label>
            </div>

            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Delivery boy (ERPNext)</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => setAddingBoy((v) => !v)}
                >
                  {addingBoy ? "Cancel" : "Add boy"}
                </Button>
              </div>

              <select
                className={inputClass}
                value={invoice.deliveryBoyId ?? ""}
                onChange={(e) => onPickBoy(e.target.value)}
                disabled={boysLoading || !!boysError || boys.length === 0}
              >
                <option value="">
                  {boysLoading
                    ? "Loading boys…"
                    : boys.length === 0
                      ? "No boys yet"
                      : "Select delivery boy…"}
                </option>
                {boys.map((b) => (
                  <option key={b.id} value={b.id}>
                    {formatBoyOption(b)}
                  </option>
                ))}
              </select>

              {boysError ? (
                <span className="block text-xs text-[var(--color-destructive)]">
                  {boysError}
                </span>
              ) : null}

              {addingBoy ? (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Creates ERPNext User with role Delivery + ZG Delivery Boy.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className={inputClass}
                      value={newBoyName}
                      onChange={(e) => setNewBoyName(e.target.value)}
                      placeholder="Full name"
                    />
                    <input
                      className={inputClass}
                      value={newBoyPhone}
                      onChange={(e) => setNewBoyPhone(e.target.value)}
                      placeholder="Phone (optional)"
                    />
                    <input
                      className={inputClass}
                      value={newBoyUsername}
                      onChange={(e) => setNewBoyUsername(e.target.value)}
                      placeholder="Username"
                      autoComplete="off"
                    />
                    <input
                      type="password"
                      className={inputClass}
                      value={newBoyPassword}
                      onChange={(e) => setNewBoyPassword(e.target.value)}
                      placeholder="Password (min 6)"
                      autoComplete="new-password"
                    />
                    <input
                      className={cn(inputClass, "sm:col-span-2")}
                      value={newBoyCode}
                      onChange={(e) => setNewBoyCode(e.target.value)}
                      placeholder="Code (optional)"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={createBoy.isPending}
                    onClick={onAddBoy}
                  >
                    {createBoy.isPending ? "Creating…" : "Create user & boy"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--pos-floor-occupied)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

function formatBoyOption(b: DeliveryBoyRecord) {
  const parts = [b.name];
  if (b.user) parts.push(b.user);
  else if (b.username) parts.push(b.username);
  if (b.status) parts.push(b.status);
  if (b.phone) parts.push(b.phone);
  return parts.join(" · ");
}
