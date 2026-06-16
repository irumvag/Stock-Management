-- Messages table for user-to-user messaging within a company.
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  uuid        TEXT NOT NULL UNIQUE,
  company_id  UUID NOT NULL REFERENCES companies(uuid) ON DELETE CASCADE,
  from_user   TEXT NOT NULL,
  to_user     TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS messages_company_to ON messages(company_id, to_user);
CREATE INDEX IF NOT EXISTS messages_updated ON messages(updated_at);
