-- Messages between users (inbox, broadcast, notifications)
CREATE TABLE IF NOT EXISTS messages (
  uuid        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   VARCHAR(100) NOT NULL,
  to_user     VARCHAR(100) NOT NULL,  -- username OR 'all' for broadcast
  subject     VARCHAR(200) NOT NULL DEFAULT '',
  body        TEXT         NOT NULL,
  is_read     BOOLEAN      NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted     BOOLEAN      NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS messages_to_user_idx   ON messages(to_user);
CREATE INDEX IF NOT EXISTS messages_from_user_idx ON messages(from_user);
CREATE INDEX IF NOT EXISTS messages_updated_idx   ON messages(updated_at);
