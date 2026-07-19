import { Button, cn, FormDialog } from "@zatgo/ui";
import type { TableRecord, TableStatus } from "@/lib/pos-repo";

const statusBg: Record<TableStatus, string> = {
  free: "bg-[var(--pos-floor-free)]",
  occupied: "bg-[var(--pos-floor-occupied)]",
  billing: "bg-[var(--pos-floor-billing)]",
};

export function FloorHubDialog({
  open,
  tables,
  onClose,
  onSelect,
}: {
  open: boolean;
  tables: TableRecord[];
  onClose: () => void;
  onSelect: (table: TableRecord) => void;
}) {
  const zones = [...new Set(tables.map((t) => t.zone))];

  return (
    <FormDialog
      open={open}
      title="Floor map"
      description="Tap a table to seat, open the check, request bill, or clear."
      onClose={onClose}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-[var(--color-muted-foreground)]">
        {(["free", "occupied", "billing"] as TableStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 capitalize">
            <span className={cn("inline-block size-3 rounded-sm", statusBg[s])} />
            {s}
          </span>
        ))}
      </div>

      <div className="space-y-5">
        {zones.map((zone) => (
          <section key={zone}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {zone}
            </h3>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {tables
                .filter((t) => t.zone === zone)
                .map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => onSelect(table)}
                    className={cn(
                      "rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 text-left",
                      statusBg[table.status],
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-lg font-semibold">{table.name}</p>
                      <span className="text-xs capitalize">{table.status}</span>
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {table.seats} seats
                      {table.covers ? ` · ${table.covers} covers` : ""}
                    </p>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </FormDialog>
  );
}
