-- Migration 005: add Waiter as a valid user role.
-- Waiters get their own login and see only their assigned open tables (mobile UI).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Owner', 'Cashier', 'Waiter'));
