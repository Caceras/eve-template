CREATE TABLE IF NOT EXISTS web_sessions (
  scope text NOT NULL,
  session_id text COLLATE "C" NOT NULL,
  owner_key text NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  title_at timestamptz,
  created_at timestamptz NOT NULL,
  last_message_at timestamptz,
  last_turn_at timestamptz,
  PRIMARY KEY (scope, session_id)
);
CREATE INDEX IF NOT EXISTS web_sessions_owner_activity
  ON web_sessions (scope, owner_key, (COALESCE(last_message_at, created_at)) DESC, session_id ASC);

CREATE TABLE IF NOT EXISTS web_session_children (
  scope text NOT NULL,
  owner_key text NOT NULL,
  parent_session_id text NOT NULL,
  call_id text NOT NULL,
  child_session_id text NOT NULL,
  PRIMARY KEY (scope, owner_key, parent_session_id, call_id, child_session_id)
);
