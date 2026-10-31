# ZatGo POS

**Status:** Runnable multi-vertical POS (partial ERPNext wiring)  
**Kind:** Electron + Vite + React  
**Package:** `@zatgo/pos` · **Path:** `apps/zatgo-pos/`  
**Backend:** `zatgo_core.api.v1.resto_pos` + `delivery` (Restaurant) or `zatgo_core.api.v1.retail_pos` (Supermarket)  
**Stack:** [FRONTEND_STACK](../../Docs/Foundation/FRONTEND_STACK.md)

Desktop POS that configures itself from the industry switched on in zatgo-core (ZG System Settings → Industries):

| Site industry | POS mode | Profile | Backend |
|---------------|----------|---------|---------|
| Restaurant | `restaurant` (wins when both are on) | Restaurant: counter, floor, orders, KDS, billing, couriers | `zatgo_core.api.v1.resto_pos` + `delivery` |
| Supermarket | `retail` | Supermarket: Counter sale with barcode scan, Products, Inventory, Reports (no floor/orders/KDS/billing/couriers) | `zatgo_core.api.v1.retail_pos` (one Sales Invoice + Payment Entry per sale) |

The mode comes from `pos_profile.get` (`pos_mode`, `retail`); neither industry on shows a blocking screen. The remaining profiles in `lib/verticals.ts` (café, pharmacy, electrical, general) are not backed by a site industry yet.

## Run

From the workspace root:

```bash
pnpm install
pnpm dev:pos
```

Or:

```bash
pnpm --filter @zatgo/pos dev
```

## Business profiles

| Profile | Typical modules |
|---------|-----------------|
| Restaurant | Floor, Orders, KDS, Menu, Billing, Inventory, Reports |
| Café | Sell + light Floor/Orders/KDS |
| Supermarket | Sell (barcode), Products, Inventory, Reports |
| Pharmacy | Sell, Medicines (Rx/batch), Inventory (expiry), Reports |
| Electrical | Sell, Catalog (serial SKUs), Inventory, Reports |
| General retail | Sell, Products, Inventory, Reports |

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Vite + Electron (port 5175) |
| `build` | Typecheck + production build |
| `typecheck` | Renderer + electron `tsc` |

Use **Setup** or the login screen to sign in with ERPNext email/password (Electron session via `@zatgo/erpnext`). Default site URL is `https://demo.zatgo.online`.

**Live via `@zatgo/erpnext` + `zatgo_core` (no local mock seed):** catalog, KDS, delivery boys (`ZG Delivery Boy` + ERPNext User role **Delivery** with username/password), assign boy on delivery checkout, delivery stop create (`ZG Delivery Stop`) on charge.

**Still local/stub until resto_pos order APIs exist:** floor tables, open orders, walk-in invoice persistence, inventory CRUD, payments history.

## Offline counter sales

The POS keeps selling when the connection drops: sales are written to an encrypted outbox on the device (before anything is printed), receipts show `PENDING SYNC` with an `OFF-<device>-<yymmdd>-<seq>` number, and the sync worker posts them FIFO when the site is reachable and the same cashier is signed in. Needs `zatgo-core` with the offline settings enabled (ZG POS Settings -> Offline). See `../CLAUDE.md` ("POS offline") for the rules; `pnpm test` runs the unit tests.

