-- Allow 'Waiter' as a valid user role (extends the CHECK constraint).
-- Postgres does not support ALTER TABLE ... ALTER CHECK, so we drop and recreate.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Owner', 'Cashier', 'Waiter'));
