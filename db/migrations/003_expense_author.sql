-- Record who added each expense and exactly when, so the owner can see it in
-- the daily report. added_at is the creation timestamp (distinct from
-- updated_at, which the sync engine bumps on every change).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_by TEXT NOT NULL DEFAULT '';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT now();
