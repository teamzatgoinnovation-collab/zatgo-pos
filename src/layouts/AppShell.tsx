import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppShellLayout,
  Button,
  CommandPalette,
  type AppShellNavItem,
  type CommandPaletteItem,
} from "@zatgo/ui";
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
import { siteAllows } from "@/lib/site-features";
import { useSiteStore } from "@/store/site";
import type { PosFeature } from "@/lib/verticals";
import { logoutFromErpnext } from "@/lib/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { DevicePinDialog } from "@/components/offline/DevicePinDialog";
import { offlineBridge } from "@/lib/offline/bridge";
import { pendingCount } from "@/lib/offline/outbox-state";
import { useOutbox } from "@/lib/offline/outbox";
import { currentScope } from "@/lib/offline/snapshot";

type PosNavItem = AppShellNavItem & { feature?: PosFeature };

const WORKSPACE_PATHS = new Set(["/sell", "/orders", "/kds", "/floor"]);

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isPosWorkspace = WORKSPACE_PATHS.has(pathname);
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  const connected = useSessionStore((s) => s.connected);
  const user = useSessionStore((s) => s.user);
  const fullName = useSessionStore((s) => s.fullName);
  const profile = useBusinessStore((s) => s.profile);
  const modules = useBusinessStore((s) => s.modules);
  const site = useSiteStore((s) => s.profile);
  const [version, setVersion] = useState("dev");
  const [signingOut, setSigningOut] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const nav = useMemo<AppShellNavItem[]>(() => {
    const items: PosNavItem[] = [
      { href: "/sell", label: "POS", icon: ScanBarcode, feature: "sell" },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/floor", label: "Floor", icon: UtensilsCrossed, feature: "floor" },
      { href: "/orders", label: "Orders", icon: ClipboardList, feature: "orders" },
      { href: "/kds", label: "KDS", icon: CookingPot, feature: "kds" },
      { href: "/menu", label: profile.catalogNounPlural, icon: SquareMenu, feature: "catalog" },
      { href: "/billing", label: "Billing", icon: Receipt, feature: "billing" },
      { href: "/delivery-boys", label: "Couriers", icon: Truck, feature: "delivery" },
      { href: "/inventory", label: "Inventory", icon: Package, feature: "inventory" },
      { href: "/reports", label: "Reports", icon: ChartColumn, feature: "reports" },
      { href: "/connection", label: "Setup", icon: Settings },
    ];
    return items
      .filter(
        (item) =>
          !item.feature ||
          (siteAllows(site, item.feature) && effectiveHasFeature(profile, item.feature, modules)),
      )
      .map(({ feature: _feature, ...item }) => item);
  }, [profile, modules, site]);

  useEffect(() => {
    void window.zatgoDesktop?.getAppVersion().then(setVersion).catch(() => undefined);
  }, []);

  // Offer a device PIN once per cashier, right after an online login (so they can reopen the POS offline).
  useEffect(() => {
    const bridge = offlineBridge();
    if (!bridge || !connected || !user) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`zatgo_pos_pin_offer:${user}`) === "1";
    } catch {
      /* ignore */
    }
    if (dismissed) return;
    void bridge.offlinePinUsers(currentScope()).then((users) => {
      if (!users.some((u) => u.user.toLowerCase() === user.toLowerCase())) setPinOpen(true);
    });
  }, [connected, user]);

  const closePin = () => {
    setPinOpen(false);
    try {
      if (user) localStorage.setItem(`zatgo_pos_pin_offer:${user}`, "1");
    } catch {
      /* ignore */
    }
  };

  const onSignOut = async () => {
    const waiting = pendingCount(useOutbox.getState().records);
    if (
      waiting > 0 &&
      !window.confirm(
        `${waiting} offline sale${waiting === 1 ? " is" : "s are"} still waiting to sync. They stay saved on this device and sync when ${user ?? "the cashier"} signs in again. Sign out?`,
      )
    ) {
      return;
    }
    setSigningOut(true);
    try {
      await logoutFromErpnext();
      toast.success("Signed out");
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const commandItems = useMemo<CommandPaletteItem[]>(
    () => [
      ...nav.map((item) => ({
        id: `nav-${item.href}`,
        label: item.label,
        group: "Navigate",
        onSelect: () => navigate(item.href),
      })),
      {
        id: "theme",
        label: `Cycle theme (now: ${mode})`,
        group: "Actions",
        shortcut: "T",
        onSelect: () => cycleMode(),
      },
      {
        id: "sign-out",
        label: "Sign out",
        group: "Actions",
        onSelect: () => void onSignOut(),
      },
    ],
    [cycleMode, mode, nav, navigate],
  );

  return (
    <>
      <CommandPalette items={commandItems} />
      <AppShellLayout
        productTitle={profile.shortLabel}
        brandLabel="ZatGo POS"
        nav={nav}
        pathname={pathname}
        className={isPosWorkspace ? "h-screen overflow-hidden" : undefined}
        renderLink={({ href, className, children, end }) => (
          <NavLink to={href} end={end} className={className}>
            {children}
          </NavLink>
        )}
        sidebarFooter={
          <>
            <p
              className="truncate font-medium text-[var(--color-foreground)]"
              title={fullName ?? user ?? undefined}
            >
              {connected || user ? fullName || user : "Not signed in"}
            </p>
            <p className="truncate">{connected ? "ERPNext" : user ? "Offline (device PIN)" : "Not connected"}</p>
            <p>v{version}</p>
          </>
        }
        headerTitle={
          <span className="truncate text-[var(--color-muted-foreground)]">
            {profile.label} · ⌘K for commands
          </span>
        }
        headerActions={
          <>
            {offlineBridge() && connected ? (
              <Button variant="outline" size="sm" onClick={() => setPinOpen(true)}>
                Device PIN
              </Button>
            ) : null}
            <Button variant="outline" size="sm" disabled={signingOut} onClick={() => void onSignOut()}>
              Sign out
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => cycleMode()}>
              {mode === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              {mode}
            </Button>
          </>
        }
        workspace={
          isPosWorkspace ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <OfflineBanner />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
                <Outlet />
              </div>
            </div>
          ) : undefined
        }
      >
        {isPosWorkspace ? undefined : (
          <>
            <OfflineBanner />
            <Outlet />
          </>
        )}
      </AppShellLayout>
      <DevicePinDialog open={pinOpen} onClose={closePin} />
    </>
  );
}
