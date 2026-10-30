import { useEffect, type ReactNode } from "react";
import { Button } from "@zatgo/ui";
import { useCartStore } from "@/store/cart";
import { useSiteStore } from "@/store/site";

/** Online-only: the POS needs the site's profile before it shows anything. */
export function SiteGate({ children }: { children: ReactNode }) {
  const status = useSiteStore((s) => s.status);
  const profile = useSiteStore((s) => s.profile);
  const error = useSiteStore((s) => s.error);
  const load = useSiteStore((s) => s.load);

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  const taxRate = profile?.taxRate;
  useEffect(() => {
    if (taxRate !== undefined) useCartStore.getState().setTaxRate(taxRate);
  }, [taxRate]);

  if (status === "idle" || status === "loading") {
    return <p className="p-6 text-sm text-[var(--color-muted-foreground)]">Loading site settings…</p>;
  }
  if (status === "error") {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-sm">
        <p className="font-medium">Could not reach the site</p>
        <p className="text-[var(--color-muted-foreground)]">{error}</p>
        <Button onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!profile?.restaurant) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-sm">
        <p className="font-medium">Restaurant POS is off on this site</p>
        <p className="text-[var(--color-muted-foreground)]">
          Ask an administrator to enable <strong>Restaurant</strong> under ZG System Settings →
          Industries, then retry.
        </p>
        <Button onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  return <>{children}</>;
}
