-- Release 2.1: append-only activity history (audit trail).
-- Lets the owner (a hands-off investor) review what each user did: products
-- added/updated, stock changes, sales, refunds, expenses, opening-stock captures.
CREATE TABLE IF NOT EXISTS activity_log (
  uuid       UUID PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  username   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  details    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_activity_updated ON activity_log(updated_at);
CREATE INDEX IF NOT EXISTS idx_activity_at      ON activity_log(at);
