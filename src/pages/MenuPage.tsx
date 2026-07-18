import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@zatgo/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { posRepo, type ProductRecord } from "@/lib/pos-repo";
import { useHasFeature } from "@/hooks/useHasFeature";
import { hasFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";

const schema = z.object({
  name: z.string().min(1, "Required"),
  category: z.string().min(1, "Required"),
  price: z.coerce.number().positive(),
  station: z.enum(["grill", "cold", "bar", "dessert", "counter"]),
  sku: z.string().min(1, "Required"),
  barcode: z.string().min(1, "Required"),
  available: z.boolean(),
  trackBatch: z.boolean().optional(),
  trackSerial: z.boolean().optional(),
  requiresPrescription: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-primary)]";

export function MenuPage() {
  const profile = useBusinessStore((s) => s.profile);
  const verticalId = useBusinessStore((s) => s.verticalId);
  const showKds = useHasFeature("kds");
  const showOrders = useHasFeature("orders");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["pos", "products", verticalId],
    queryFn: () => posRepo.listProducts(verticalId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category: "General",
      price: 10,
      station: showKds ? "grill" : "counter",
      sku: "",
      barcode: "",
      available: true,
      trackBatch: false,
      trackSerial: false,
      requiresPrescription: false,
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      posRepo.upsertMenuItem({
        id: editing?.id,
        ...values,
        verticals: editing?.verticals ?? [verticalId],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success(editing ? "Updated" : "Created");
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => posRepo.deleteMenuItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("Deleted");
    },
  });

  const columns = useMemo<ColumnDef<ProductRecord>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "sku", header: "SKU" },
      { accessorKey: "barcode", header: "Barcode" },
      { accessorKey: "category", header: "Category" },
      {
        accessorKey: "price",
        header: "Price",
        cell: ({ row }) => `$${row.original.price.toFixed(2)}`,
      },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) => {
          const flags = [
            row.original.requiresPrescription ? "Rx" : null,
            row.original.trackBatch ? "Batch" : null,
            row.original.trackSerial ? "SN" : null,
            !row.original.available ? "Off" : null,
          ].filter(Boolean);
          return flags.length ? flags.join(" · ") : "—";
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => {
                setEditing(row.original);
                form.reset({
                  name: row.original.name,
                  category: row.original.category,
                  price: row.original.price,
                  station: row.original.station,
                  sku: row.original.sku,
                  barcode: row.original.barcode,
                  available: row.original.available,
                  trackBatch: !!row.original.trackBatch,
                  trackSerial: !!row.original.trackSerial,
                  requiresPrescription: !!row.original.requiresPrescription,
                });
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs text-[var(--color-destructive)]"
              onClick={() => remove.mutate(row.original.id)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [form, remove],
  );

  return (
    <div>
      <PageHeader
        title={profile.catalogNounPlural}
        description={`Sellable ${profile.catalogNounPlural.toLowerCase()} for ${profile.label}.`}
        actions={
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search…" />
            <Button
              onClick={() => {
                setEditing(null);
                form.reset({
                  name: "",
                  category: "General",
                  price: 10,
                  station: showKds ? "grill" : "counter",
                  sku: "",
                  barcode: "",
                  available: true,
                  trackBatch: false,
                  trackSerial: false,
                  requiresPrescription: false,
                });
                setOpen(true);
              }}
            >
              Add {profile.catalogNoun.toLowerCase()}
            </Button>
          </>
        }
      />
      <DataTable data={data} columns={columns} globalFilter={search} emptyMessage="No items" />

      <FormDialog
        open={open}
        title={editing ? `Edit ${profile.catalogNoun.toLowerCase()}` : `Add ${profile.catalogNoun.toLowerCase()}`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} disabled={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <input className={inputClass} {...form.register("name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU" error={form.formState.errors.sku?.message}>
              <input className={inputClass} {...form.register("sku")} />
            </Field>
            <Field label="Barcode" error={form.formState.errors.barcode?.message}>
              <input className={inputClass} {...form.register("barcode")} />
            </Field>
          </div>
          <Field label="Category" error={form.formState.errors.category?.message}>
            <input className={inputClass} {...form.register("category")} />
          </Field>
          <Field label="Price" error={form.formState.errors.price?.message}>
            <input type="number" step="0.01" className={inputClass} {...form.register("price")} />
          </Field>
          {showKds || showOrders ? (
            <Field label="Kitchen station" error={form.formState.errors.station?.message}>
              <select className={inputClass} {...form.register("station")}>
                <option value="grill">Grill</option>
                <option value="cold">Cold</option>
                <option value="bar">Bar</option>
                <option value="dessert">Dessert</option>
                <option value="counter">Counter</option>
              </select>
            </Field>
          ) : (
            <input type="hidden" {...form.register("station")} value="counter" />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("available")} />
            Available
          </label>
          {hasFeature(profile, "batches") ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("trackBatch")} />
              Track batch / expiry
            </label>
          ) : null}
          {hasFeature(profile, "serials") ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("trackSerial")} />
              Track serial numbers
            </label>
          ) : null}
          {hasFeature(profile, "prescriptions") ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("requiresPrescription")} />
              Requires prescription
            </label>
          ) : null}
        </div>
      </FormDialog>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-xs text-[var(--color-destructive)]">{error}</span> : null}
    </label>
  );
}
