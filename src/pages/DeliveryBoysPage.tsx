import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@zatgo/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { posRepo, type DeliveryBoyRecord } from "@/lib/pos-repo";

const schema = z.object({
  fullName: z.string().min(1, "Required"),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .regex(/^[a-zA-Z0-9.@_-]+$/, "Letters, numbers, . _ - or email"),
  password: z.string().min(6, "At least 6 characters"),
  code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "h-9 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-primary)]";

export function DeliveryBoysPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data = [], isLoading, error, isError } = useQuery({
    queryKey: ["pos", "delivery-boys"],
    queryFn: () => posRepo.listDeliveryBoys({ includeOffDuty: true }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      username: "",
      password: "",
      code: "",
      phone: "",
      email: "",
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      posRepo.createDeliveryBoy({
        fullName: values.fullName,
        username: values.username,
        password: values.password,
        code: values.code,
        phone: values.phone,
        email: values.email || undefined,
      }),
    onSuccess: (boy) => {
      void qc.invalidateQueries({ queryKey: ["pos", "delivery-boys"] });
      toast.success(
        `${boy.name} created — Delivery login: ${boy.user || boy.username} (role Delivery)`,
      );
      setOpen(false);
      form.reset({
        fullName: "",
        username: "",
        password: "",
        code: "",
        phone: "",
        email: "",
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create delivery boy");
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.code || "").toLowerCase().includes(q) ||
        (b.phone || "").includes(q) ||
        (b.status || "").toLowerCase().includes(q) ||
        (b.username || "").toLowerCase().includes(q) ||
        (b.user || "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<DeliveryBoyRecord>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      {
        id: "login",
        header: "ERPNext login",
        cell: ({ row }) =>
          row.original.user || row.original.username || (
            <span className="text-[var(--color-muted-foreground)]">No user</span>
          ),
      },
      { accessorKey: "phone", header: "Phone" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className="capitalize">{row.original.status || "—"}</span>
        ),
      },
      {
        accessorKey: "points",
        header: "Points",
        cell: ({ row }) => row.original.points ?? 0,
      },
      {
        accessorKey: "bonus",
        header: "Bonus",
        cell: ({ row }) => row.original.bonus ?? 0,
      },
      {
        accessorKey: "vehicle",
        header: "Vehicle",
        cell: ({ row }) => row.original.vehicle || "—",
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery boys"
        description="Creates ZG Delivery Boy + ERPNext User (role Delivery). Delivery app login uses the user email (username@delivery.local unless you set email)."
        actions={
          <Button
            onClick={() => {
              form.reset({
                fullName: "",
                username: "",
                password: "",
                code: "",
                phone: "",
                email: "",
              });
              setOpen(true);
            }}
          >
            Add boy
          </Button>
        }
      />

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search name, login, code…"
      />

      {isError ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--pos-floor-occupied)] px-3 py-2 text-sm">
          {error instanceof Error ? error.message : "Failed to load delivery boys"}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={
          isLoading
            ? "Loading from ERPNext…"
            : "No delivery boys — add one with username and password."
        }
      />

      <FormDialog
        open={open}
        title="Add delivery boy"
        description="Creates ERPNext User (role Delivery) + ZG Delivery Boy. They sign into the Delivery app with this username/password."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={form.handleSubmit((values) => save.mutate(values))}
            >
              {save.isPending ? "Saving…" : "Create user & boy"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Full name</span>
            <input className={inputClass} {...form.register("fullName")} />
            {form.formState.errors.fullName ? (
              <span className="text-xs text-[var(--color-destructive)]">
                {form.formState.errors.fullName.message}
              </span>
            ) : null}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Username</span>
              <input
                className={inputClass}
                autoComplete="off"
                placeholder="courier1"
                {...form.register("username")}
              />
              {form.formState.errors.username ? (
                <span className="text-xs text-[var(--color-destructive)]">
                  {form.formState.errors.username.message}
                </span>
              ) : null}
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Password</span>
              <input
                type="password"
                className={inputClass}
                autoComplete="new-password"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <span className="text-xs text-[var(--color-destructive)]">
                  {form.formState.errors.password.message}
                </span>
              ) : null}
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Email (optional)</span>
            <input
              className={inputClass}
              placeholder="defaults to username@delivery.local"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <span className="text-xs text-[var(--color-destructive)]">
                {form.formState.errors.email.message}
              </span>
            ) : null}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Code (optional)</span>
              <input
                className={inputClass}
                placeholder="Auto DB-00N"
                {...form.register("code")}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Phone (optional)</span>
              <input
                className={inputClass}
                placeholder="+966 …"
                {...form.register("phone")}
              />
            </label>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
