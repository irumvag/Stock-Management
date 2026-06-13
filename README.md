# Club TMP Stock Manager — Release 2 (PWA + Online Sync)

An offline-first **PWA** for stock and sales management with an **online Neon Postgres**
backend. Installs on a Windows PC, works fully offline, and syncs to the cloud when
internet is available so the **Owner** can see live data and reports remotely.

## What changed from Release 1
- Electron desktop app → **installable PWA** (single codebase for both roles).
- Local-only SQLite → **IndexedDB (offline) + Neon Postgres (cloud)** with background sync.
- Roles: Manager/Waiter → **Owner / Cashier**.
- **Buying price and profit removed** — only selling price; reports focus on what went **out**.
- New **Daily Report** (opening / closing / sold / amount + payments + expenses), matching the handwritten sheet.
- **Sync status badge** in the sidebar (Synced / Pending / Offline / Syncing / Error).

## Architecture
```
PWA (web/)  ──IndexedDB(Dexie)+outbox──┐
   │  service worker (offline shell)    │ sync engine (push/pull, online detection)
   ▼                                     ▼
serverless API (api/)  ──JWT auth──▶  Neon Postgres (db/)  ◀── Owner reports
```
- `web/` — PWA frontend. `web/api.js` reimplements the old `window.api` over Dexie; `web/sync.js` is the sync engine.
- `api/` — Vercel serverless functions: `auth/login`, `users`, `sync/pull`, `sync/push`.
- `db/` — SQL migrations + seed + `migrate.js` runner.
- `legacy/` — the original Electron files, kept for reference (not built).

## Setup

1. **Create a Neon project** and copy its connection string.
2. Create `.env` in the project root:
   ```
   DATABASE_URL=postgres://...neon...
   JWT_SECRET=<a long random string>
   ```
3. Install deps and run migrations + seed:
   ```
   npm install
   npm run migrate -- --seed     # creates tables + sample products + admin user
   ```
   Default login: **admin / admin123** (Owner). Change the password after first sign-in.

## Develop locally
```
npm run api      # vercel dev  -> serverless API on :3000  (needs `vercel` CLI + .env)
npm run dev      # vite        -> PWA on :5173, proxies /api/* to :3000
```
The first login must be **online** (to fetch and cache credentials). After that the
device can log in and operate offline; data syncs automatically when back online.

## Build & deploy
```
npm run build    # outputs dist/ (PWA + service worker)
```
Deploy the repo to **Vercel** — it serves `dist/` as the static PWA and runs `api/` as
functions. Set `DATABASE_URL` and `JWT_SECRET` in the Vercel project env. On the Windows
PC, open the deployed URL in Edge/Chrome and choose **Install app**.

## Roles
- **Owner** — dashboard, POS, inventory, sales history, daily report, full reports, user management.
- **Cashier** — POS, inventory, daily report, sales history (data entry). No user management or analytics.
