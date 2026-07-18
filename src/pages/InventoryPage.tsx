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
import { posRepo, type InventoryRecord } from "@/lib/pos-repo";
import { hasFeature } from "@/lib/verticals";
import { useBusinessStore } from "@/store/business";

const schema = z.object({
  name: z.string().min(1, "Required"),
  category: z.string().min(1, "Required"),
  unit: z.string().min(1, "Required"),
  onHand: z.coerce.number().min(0),
  reorderAt: z.coerce.number().min(0),
  batchNo: z.string().optional(),
  expiresAt: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-primary)]";

export function InventoryPage() {
  const profile = useBusinessStore((s) => s.profile);
  const verticalId = useBusinessStore((s) => s.verticalId);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InventoryRecord | null>(null);
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["pos", "inventory", verticalId],
    queryFn: () => posRepo.listInventory(verticalId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category: "Dry",
      unit: "kg",
      onHand: 0,
      reorderAt: 0,
      batchNo: "",
      expiresAt: "",
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      posRepo.upsertInventory({
        id: editing?.id,
        name: values.name,
        category: values.category,
        unit: values.unit,
        onHand: values.onHand,
        reorderAt: values.reorderAt,
        verticals: editing?.verticals ?? [verticalId],
        batchNo: values.batchNo || undefined,
        expiresAt: values.expiresAt || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success(editing ? "Stock updated" : "Item added");
      setOpen(false);
      setEditing(null);
    },
  });

  const columns = useMemo<ColumnDef<InventoryRecord>[]>(
    () => [
      { accessorKey: "name", header: "Item" },
      { accessorKey: "category", header: "Category" },
      {
        id: "qty",
        header: "On hand",
        cell: ({ row }) => `${row.original.onHand} ${row.original.unit}`,
      },
      {
        accessorKey: "reorderAt",
        header: "Reorder at",
        cell: ({ row }) => `${row.original.reorderAt} ${row.original.unit}`,
      },
      ...(hasFeature(profile, "batches")
        ? ([
            {
              id: "batch",
              header: "Batch / expiry",
              cell: ({ row }) =>
                [row.original.batchNo, row.original.expiresAt].filter(Boolean).join(" · ") || "—",
            },
          ] as ColumnDef<InventoryRecord>[])
        : []),
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.onHand <= row.original.reorderAt ? (
            <span className="text-[var(--color-destructive)]">Low</span>
          ) : (
            "OK"
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => {
                setEditing(row.original);
                form.reset({
                  name: row.original.name,
                  category: row.original.category,
                  unit: row.original.unit,
                  onHand: row.original.onHand,
                  reorderAt: row.original.reorderAt,
                  batchNo: row.original.batchNo ?? "",
                  expiresAt: row.original.expiresAt ?? "",
                });
                setOpen(true);
              }}
            >
              Adjust
            </Button>
          </div>
        ),
      },
    ],
    [form, profile],
  );

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`Stock for ${profile.label} (mock until backend APIs exist).`}
        actions={
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search stock…" />
            <Button
              onClick={() => {
                setEditing(null);
                form.reset({
                  name: "",
                  category: "Dry",
                  unit: "kg",
                  onHand: 0,
                  reorderAt: 0,
                  batchNo: "",
                  expiresAt: "",
                });
                setOpen(true);
              }}
            >
              Add item
            </Button>
          </>
        }
      />
      <DataTable data={data} columns={columns} globalFilter={search} emptyMessage="No stock rows" />

      <FormDialog
        open={open}
        title={editing ? "Adjust stock" : "Add stock item"}
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
          <Field label="Category" error={form.formState.errors.category?.message}>
            <input className={inputClass} {...form.register("category")} />
          </Field>
          <Field label="Unit" error={form.formState.errors.unit?.message}>
            <input className={inputClass} {...form.register("unit")} />
          </Field>
          <Field label="On hand" error={form.formState.errors.onHand?.message}>
            <input type="number" step="0.1" className={inputClass} {...form.register("onHand")} />
          </Field>
          <Field label="Reorder at" error={form.formState.errors.reorderAt?.message}>
            <input type="number" step="0.1" className={inputClass} {...form.register("reorderAt")} />
          </Field>
          {hasFeature(profile, "batches") ? (
            <>
              <Field label="Batch no.">
                <input className={inputClass} {...form.register("batchNo")} />
              </Field>
              <Field label="Expires">
                <input type="date" className={inputClass} {...form.register("expiresAt")} />
              </Field>
            </>
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
