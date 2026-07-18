import { Button, cn } from "@zatgo/ui";
import { toast } from "sonner";
import { PREF_MODULES, type PrefModule } from "@/lib/modules";
import { useBusinessStore } from "@/store/business";

export function FeaturePreferences() {
  const modules = useBusinessStore((s) => s.modules);
  const profile = useBusinessStore((s) => s.profile);
  const setModule = useBusinessStore((s) => s.setModule);
  const resetModulesToProfile = useBusinessStore((s) => s.resetModulesToProfile);

  const onToggle = (id: PrefModule, enabled: boolean) => {
    setModule(id, enabled);
    const label = PREF_MODULES.find((m) => m.id === id)?.label ?? id;
    toast.success(`${label} ${enabled ? "enabled" : "disabled"}`);
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Module preferences
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            Turn tables, orders, and kitchen on or off for this terminal. Defaults follow{" "}
            {profile.shortLabel}; changing business profile resets these.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={() => {
            resetModulesToProfile();
            toast.message(`Reset to ${profile.shortLabel} defaults`);
          }}
        >
          Reset to profile
        </Button>
      </div>

      <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
        {PREF_MODULES.map((mod) => {
          const on = modules[mod.id];
          return (
            <label
              key={mod.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] px-3 py-3 transition-colors",
                on ? "bg-[var(--pos-sidebar-active)]" : "hover:bg-[var(--color-muted)]",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--color-primary)]"
                checked={on}
                onChange={(e) => onToggle(mod.id, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{mod.label}</span>
                <span className="block text-xs text-[var(--color-muted-foreground)]">
                  {mod.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
