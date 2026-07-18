import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { RequireFeature } from "@/components/RequireFeature";
import { AppShell } from "@/layouts/AppShell";
import { hydrateErpnextSession } from "@/lib/client";
import { BillingPage } from "@/pages/BillingPage";
import { ConnectionPage } from "@/pages/ConnectionPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeliveryBoysPage } from "@/pages/DeliveryBoysPage";
import { FloorPage } from "@/pages/FloorPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { KdsPage } from "@/pages/KdsPage";
import { LoginPage } from "@/pages/LoginPage";
import { MenuPage } from "@/pages/MenuPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SellPage } from "@/pages/SellPage";
import { useSessionStore } from "@/store/session";

const Router = window.zatgoDesktop ? HashRouter : BrowserRouter;

function RequireAuth({ children }: { children: React.ReactNode }) {
  const connected = useSessionStore((s) => s.connected);
  if (!connected) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/sell" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="sell"
          element={
            <RequireFeature feature="sell" fallback="/dashboard">
              <SellPage />
            </RequireFeature>
          }
        />
        <Route
          path="floor"
          element={
            <RequireFeature feature="floor">
              <FloorPage />
            </RequireFeature>
          }
        />
        <Route
          path="orders"
          element={
            <RequireFeature feature="orders">
              <OrdersPage />
            </RequireFeature>
          }
        />
        <Route
          path="kds"
          element={
            <RequireFeature feature="kds">
              <KdsPage />
            </RequireFeature>
          }
        />
        <Route
          path="menu"
          element={
            <RequireFeature feature="catalog">
              <MenuPage />
            </RequireFeature>
          }
        />
        <Route
          path="billing"
          element={
            <RequireFeature feature="billing">
              <BillingPage />
            </RequireFeature>
          }
        />
        <Route
          path="delivery-boys"
          element={
            <RequireFeature feature="sell" fallback="/dashboard">
              <DeliveryBoysPage />
            </RequireFeature>
          }
        />
        <Route
          path="inventory"
          element={
            <RequireFeature feature="inventory">
              <InventoryPage />
            </RequireFeature>
          }
        />
        <Route
          path="reports"
          element={
            <RequireFeature feature="reports">
              <ReportsPage />
            </RequireFeature>
          }
        />
        <Route path="connection" element={<ConnectionPage />} />
        <Route path="*" element={<Navigate to="/sell" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hydrateErpnextSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Starting ZatGo POS…
      </div>
    );
  }

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
