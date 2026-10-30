-- Sync log: one row per (user, kind, key), the newest `at` wins. `seq` orders rows for cursor pulls.
CREATE TABLE changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL,
  UNIQUE (user_id, kind, key)
) STRICT;

CREATE INDEX changes_user_seq ON changes (user_id, seq);
