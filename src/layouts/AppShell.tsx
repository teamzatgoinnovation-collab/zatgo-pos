import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Button, cn } from "@zatgo/ui";
import {
  ClipboardList,
  LayoutDashboard,
  Moon,
  Package,
  Receipt,
  Settings,
  Sun,
  CookingPot,
  UtensilsCrossed,
  ChartColumn,
  SquareMenu,
  ScanBarcode,
  Truck,
} from "@zatgo/icons";
import { useThemeStore } from "@/store/theme";
import { useSessionStore } from "@/store/session";
import { useBusinessStore } from "@/store/business";
import { effectiveHasFeature } from "@/lib/modules";
import type { PosFeature } from "@/lib/verticals";
import { logoutFromErpnext } from "@/lib/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  feature?: PosFeature;
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isPosWorkspace =
    location.pathname === "/sell" ||
    location.pathname === "/orders" ||
    location.pathname === "/kds" ||
    location.pathname === "/floor";
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const connected = useSessionStore((s) => s.connected);
  const user = useSessionStore((s) => s.user);
  const fullName = useSessionStore((s) => s.fullName);
  const baseUrl = useSessionStore((s) => s.connection.baseUrl);
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  const [version, setVersion] = useState("dev");
  const [signingOut, setSigningOut] = useState(false);

  const nav = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      { to: "/sell", label: "POS", icon: ScanBarcode, feature: "sell" },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/floor", label: "Floor", icon: UtensilsCrossed, feature: "floor" },
      { to: "/orders", label: "Orders", icon: ClipboardList, feature: "orders" },
      { to: "/kds", label: "KDS", icon: CookingPot, feature: "kds" },
      { to: "/menu", label: profile.catalogNounPlural, icon: SquareMenu, feature: "catalog" },
      { to: "/billing", label: "Billing", icon: Receipt, feature: "billing" },
      { to: "/delivery-boys", label: "Couriers", icon: Truck, feature: "sell" },
      { to: "/inventory", label: "Inventory", icon: Package, feature: "inventory" },
      { to: "/reports", label: "Reports", icon: ChartColumn, feature: "reports" },
      { to: "/connection", label: "Setup", icon: Settings },
    ];
    return items.filter(
      (item) => !item.feature || effectiveHasFeature(profile, item.feature, modules),
    );
  }, [profile, modules]);

  useEffect(() => {
    void window.zatgoDesktop?.getAppVersion().then(setVersion).catch(() => undefined);
  }, []);

  const cycleTheme = () => {
    const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(next);
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await logoutFromErpnext();
      toast.success("Signed out");
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--pos-sidebar)]">
        <div className="border-b border-[var(--color-border)] px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            ZatGo POS
          </p>
          <p className="text-lg font-semibold">{profile.shortLabel}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-[var(--radius-lg)] px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--pos-sidebar-active)] font-medium text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--pos-sidebar-active)] hover:text-[var(--color-foreground)]",
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
          <p
            className="truncate font-medium text-[var(--color-foreground)]"
            title={fullName ?? user ?? undefined}
          >
            {connected ? fullName || user : "Not signed in"}
          </p>
          <p className="truncate">{connected ? "ERPNext" : "Not connected"}</p>
          <p>v{version}</p>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-4">
          <p className="truncate text-sm text-[var(--color-muted-foreground)]">
            {profile.label}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={cycleTheme}>
              {mode === "dark" ? (
                <Moon className="size-4" />
              ) : mode === "light" ? (
                <Sun className="size-4" />
              ) : (
                <Settings className="size-4" />
              )}
              Theme: {mode}
            </Button>
            <Button variant="outline" disabled={signingOut} onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </div>
        </header>
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isPosWorkspace ? "overflow-hidden p-4" : "overflow-auto p-6",
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
