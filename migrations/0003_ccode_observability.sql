CREATE TABLE IF NOT EXISTS ccode_session_registry (
  session_id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  execution_mode TEXT,
  ticket_ref TEXT,
  dispatch_id TEXT,
  source_host TEXT,
  archive_key TEXT,
  has_session_start INTEGER NOT NULL DEFAULT 0,
  has_session_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ccode_shipper_checkpoint (
  checkpoint_key TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  last_inode TEXT,
  last_offset INTEGER NOT NULL DEFAULT 0,
  last_mtime TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
