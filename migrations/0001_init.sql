-- 0001_init.sql
-- SRE-of-Me / SOMC-8
-- Phase 1 schema + orchestration event_log
-- D1 / SQLite-compatible

-- =========================
-- 1) services
-- .910 Section 1.4
-- =========================
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  target_frequency TEXT NOT NULL,
  green_threshold_session_days INTEGER NOT NULL CHECK (green_threshold_session_days >= 0),
  green_threshold_duration_minutes INTEGER NOT NULL CHECK (green_threshold_duration_minutes >= 0),
  session_floor_minutes INTEGER NOT NULL CHECK (session_floor_minutes >= 0),
  display_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier IN (1, 2)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
CREATE INDEX IF NOT EXISTS idx_services_display_order ON services(display_order);
CREATE INDEX IF NOT EXISTS idx_services_tier ON services(tier);

-- =========================
-- 2) settings
-- .910 Section 1.6
-- Key/value store
-- =========================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =========================
-- 3) sessions
-- .910 Section 1.1
-- =========================
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  occurred_at TEXT NOT NULL, -- UTC ISO-8601 timestamp
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes TEXT,
  anomaly_flagged INTEGER NOT NULL DEFAULT 0 CHECK (anomaly_flagged IN (0, 1)),
  anomaly_note TEXT,
  deleted_at TEXT,
  FOREIGN KEY (service_id) REFERENCES services(id),
  CHECK (
    anomaly_flagged = 0
    OR (anomaly_flagged = 1 AND anomaly_note IS NOT NULL AND length(trim(anomaly_note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_sessions_service_id ON sessions(service_id);
CREATE INDEX IF NOT EXISTS idx_sessions_occurred_at ON sessions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at ON sessions(deleted_at);

-- =========================
-- 4) deviations
-- .910 Section 1.2
-- =========================
CREATE TABLE IF NOT EXISTS deviations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT,            -- YYYY-MM-DD or NULL
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  deleted_at TEXT,
  FOREIGN KEY (service_id) REFERENCES services(id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_deviations_service_id ON deviations(service_id);
CREATE INDEX IF NOT EXISTS idx_deviations_start_date ON deviations(start_date);
CREATE INDEX IF NOT EXISTS idx_deviations_end_date ON deviations(end_date);
CREATE INDEX IF NOT EXISTS idx_deviations_deleted_at ON deviations(deleted_at);

-- =========================
-- 5) threshold_changes
-- .910 Section 1.3
-- Generic key-value audit
-- =========================
CREATE TABLE IF NOT EXISTS threshold_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER, -- NULL = global setting change
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX IF NOT EXISTS idx_threshold_changes_service_id ON threshold_changes(service_id);
CREATE INDEX IF NOT EXISTS idx_threshold_changes_field_name ON threshold_changes(field_name);
CREATE INDEX IF NOT EXISTS idx_threshold_changes_timestamp ON threshold_changes(timestamp);

-- =========================
-- 6) edit_history
-- .910 Section 1.5
-- Entity-agnostic audit trail
-- =========================
CREATE TABLE IF NOT EXISTS edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'deviation', 'service', 'setting')),
  entity_id INTEGER NOT NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_edit_history_entity ON edit_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_edit_history_timestamp ON edit_history(timestamp);

-- =========================
-- 7) event_log
-- .940 Section 4
-- Orchestration bridge
-- =========================
CREATE TABLE IF NOT EXISTS event_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL,
  target TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'instruction',
      'status_update',
      'progress',
      'query',
      'response',
      'error',
      'clarification',
      'supersede'
    )
  ),
  parent_event_id TEXT,
  content TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  FOREIGN KEY (parent_event_id) REFERENCES event_log(event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_actor ON event_log(actor);
CREATE INDEX IF NOT EXISTS idx_event_log_parent_event_id ON event_log(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON event_log(timestamp);
