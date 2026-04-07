-- Expand event_type CHECK constraint to include observability event types
-- SOMC-138 fix: D1 CHECK constraint rejected new event types

PRAGMA foreign_keys=OFF;

CREATE TABLE event_log_new (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  target TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'instruction', 'status_update', 'progress',
      'query', 'response', 'error',
      'clarification', 'supersede',
      'session_start', 'session_end',
      'file_change', 'external_side_effect',
      'permission_block', 'execution_error',
      'workspace_change_summary'
    )
  ),
  parent_event_id TEXT,
  content TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  FOREIGN KEY (parent_event_id) REFERENCES event_log_new(event_id)
);

INSERT INTO event_log_new SELECT * FROM event_log;

DROP TABLE event_log;

ALTER TABLE event_log_new RENAME TO event_log;

PRAGMA foreign_keys=ON;
