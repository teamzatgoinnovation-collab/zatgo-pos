# ZatGo POS

**Status:** Runnable multi-vertical POS (partial ERPNext wiring)  
**Kind:** Electron + Vite + React  
**Package:** `@zatgo/pos` · **Path:** `apps/zatgo-pos/`  
**Backend:** `zatgo_core.api.v1.resto_pos` + `zatgo_core.api.v1.delivery` (ERPNext DocTypes)  
**Stack:** [FRONTEND_STACK](../../Docs/Foundation/FRONTEND_STACK.md)

Desktop POS for **restaurant, café, supermarket, pharmacy, electrical shops**, and general retail. Choose a business profile under **Setup** — modules and catalog adapt accordingly.

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

Use **Setup** or the login screen to sign in with ERPNext email/password (Electron session via `@zatgo/erpnext`). Default site URL is `https://erp.zatgo.online`.

**Live via `@zatgo/erpnext` + `zatgo_core` (no local mock seed):** catalog, KDS, delivery boys (`ZG Delivery Boy` + ERPNext User role **Delivery** with username/password), assign boy on delivery checkout, delivery stop create (`ZG Delivery Stop`) on charge.

**Still local/stub until resto_pos order APIs exist:** floor tables, open orders, walk-in invoice persistence, inventory CRUD, payments history.
