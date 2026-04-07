-- 0002_seed.sql
-- SRE-of-Me / SOMC-9
-- Seed data: 4 Tier 1 services + 10 settings keys
-- Source: .910 Section 1.4 (services), .910 Section 1.6 (settings), .010 (policy thresholds)

-- =========================
-- 1) services
-- 4 Tier 1 services per policy .010
-- =========================
INSERT INTO services (name, target_frequency, green_threshold_session_days, green_threshold_duration_minutes, session_floor_minutes, display_order, active, tier)
VALUES
  ('Martial Arts', 'Daily',    5, 105, 15, 1, 1, 1),
  ('Meditation',   'Daily',    5,  70, 10, 2, 1, 1),
  ('Fitness',      '6x/week',  5,  90, 15, 3, 1, 1),
  ('Music (Bass)', '3x/week',  3,  45, 15, 4, 1, 1);

-- =========================
-- 2) settings
-- 10 keys per .910 Section 1.6
-- =========================
INSERT INTO settings (key, value) VALUES ('inspection_window_days',          '7');
INSERT INTO settings (key, value) VALUES ('inspection_window_includes_today', 'false');
INSERT INTO settings (key, value) VALUES ('user_timezone',                    'America/New_York');
INSERT INTO settings (key, value) VALUES ('day_start_hour',                   '4');
INSERT INTO settings (key, value) VALUES ('escalation_advisory_weeks',        '1');
INSERT INTO settings (key, value) VALUES ('escalation_warning_weeks',         '2');
INSERT INTO settings (key, value) VALUES ('escalation_breach_weeks',          '3');
INSERT INTO settings (key, value) VALUES ('soft_delete_retention_days',       '42');
INSERT INTO settings (key, value) VALUES ('decide_answer_timeout_seconds',    '30');
INSERT INTO settings (key, value) VALUES ('anomaly_min_sessions',             '5');
