-- Record which cashier recorded each sale, so the owner can track how much
-- money each cashier collected per day (their daily "takings"). Distinct from
-- waiter_name, which is the person who served the table.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier);
