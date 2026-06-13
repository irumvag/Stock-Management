-- Release 2 schema for Neon Postgres.
-- Source of truth for all clients. No buying_price anywhere — only selling price
-- and what went OUT. Every syncable row carries uuid + updated_at + deleted so the
-- PWA outbox/pull engine can do last-write-wins reconciliation.

CREATE TABLE IF NOT EXISTS users (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Cashier' CHECK (role IN ('Owner', 'Cashier')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at);

CREATE TABLE IF NOT EXISTS products (
  uuid            UUID PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  size_unit       TEXT NOT NULL DEFAULT '',
  selling_price   NUMERIC NOT NULL DEFAULT 0,
  current_stock   INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted         BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sales (
  uuid           UUID PRIMARY KEY,
  sale_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  products       JSONB NOT NULL,           -- [{product_uuid, product_name, size_unit, unit_price, quantity, subtotal}]
  total_amount   NUMERIC NOT NULL DEFAULT 0,
  waiter_name    TEXT NOT NULL,
  customer_name  TEXT,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Card', 'Mobile Money')),
  refunded       BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted        BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS waiters (
  uuid       UUID PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS drafts (
  uuid          UUID PRIMARY KEY,
  waiter_name   TEXT NOT NULL,
  table_number  TEXT NOT NULL,
  customer_name TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  items         JSONB NOT NULL DEFAULT '[]', -- embedded items: [{product_uuid, product_name, size_unit, unit_price, quantity, subtotal}]
  total_amount  NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  deleted       BOOLEAN NOT NULL DEFAULT false
);

-- Daily reconciliation snapshot (the handwritten sheet): opening stock captured at
-- day start; closing = current stock; sold = opening - closing.
CREATE TABLE IF NOT EXISTS daily_snapshots (
  uuid          UUID PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  product_uuid  UUID NOT NULL,
  product_name  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  size_unit     TEXT NOT NULL DEFAULT '',
  opening_stock INTEGER NOT NULL DEFAULT 0,
  closing_stock INTEGER,
  unit_price    NUMERIC NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (snapshot_date, product_uuid)
);

-- Daily expenses / payouts (the "Food: 22,000" line in the report).
CREATE TABLE IF NOT EXISTS expenses (
  uuid         UUID PRIMARY KEY,
  expense_date DATE NOT NULL,
  label        TEXT NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,
  category     TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('Food', 'Other')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_updated    ON sales(updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_date       ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_waiters_updated  ON waiters(updated_at);
CREATE INDEX IF NOT EXISTS idx_drafts_updated   ON drafts(updated_at);
CREATE INDEX IF NOT EXISTS idx_snap_updated     ON daily_snapshots(updated_at);
CREATE INDEX IF NOT EXISTS idx_snap_date        ON daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_expenses_updated ON expenses(updated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_date    ON expenses(expense_date);
