-- Release 3: multi-company isolation.
-- Every data row is scoped to a company. Existing rows migrate to 'Club TMP'.

-- 1. Companies directory
CREATE TABLE IF NOT EXISTS companies (
  uuid       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,   -- login code, e.g. "clubtmp"
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_companies_slug    ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_updated ON companies(updated_at);

-- 2. System-level admins (not scoped to any company)
CREATE TABLE IF NOT EXISTS super_admins (
  uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Default company for all existing data
INSERT INTO companies (uuid, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Club TMP', 'clubtmp')
ON CONFLICT (slug) DO NOTHING;

-- 4. Add company_id to all data tables (nullable for the backfill pass)
ALTER TABLE users           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE products        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE sales           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE waiters         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE drafts          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE daily_snapshots ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);
ALTER TABLE activity_log    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(uuid);

-- 5. Backfill every existing row into the default company
UPDATE users           SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE products        SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE sales           SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE waiters         SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE drafts          SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE daily_snapshots SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE expenses        SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE activity_log    SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 6. Now enforce NOT NULL
ALTER TABLE users           ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE products        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE sales           ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE waiters         ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE drafts          ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE daily_snapshots ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE expenses        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE activity_log    ALTER COLUMN company_id SET NOT NULL;

-- 7. Username is now unique per company (not globally)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT users_username_company_unique UNIQUE (company_id, username);

-- 8. Waiter name is now unique per company
ALTER TABLE waiters DROP CONSTRAINT IF EXISTS waiters_name_key;
ALTER TABLE waiters ADD CONSTRAINT waiters_name_company_unique UNIQUE (company_id, name);

-- 9. Daily snapshot uniqueness now includes company
ALTER TABLE daily_snapshots DROP CONSTRAINT IF EXISTS daily_snapshots_snapshot_date_product_uuid_key;
ALTER TABLE daily_snapshots ADD CONSTRAINT daily_snapshots_company_date_product UNIQUE (company_id, snapshot_date, product_uuid);

-- 10. Indexes for company-scoped queries
CREATE INDEX IF NOT EXISTS idx_users_company     ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company  ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_company     ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_waiters_company   ON waiters(company_id);
CREATE INDEX IF NOT EXISTS idx_drafts_company    ON drafts(company_id);
CREATE INDEX IF NOT EXISTS idx_snap_company      ON daily_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company  ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_company  ON activity_log(company_id);
