CREATE TABLE IF NOT EXISTS sensor_events (
  id BIGSERIAL,
  topic TEXT NOT NULL,
  device_id TEXT NOT NULL,
  sensor_name TEXT,
  value_double DOUBLE PRECISION,
  value_text TEXT,
  unit TEXT,
  qos SMALLINT NOT NULL DEFAULT 0,
  retained BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
);

SELECT create_hypertable(
  'sensor_events',
  'recorded_at',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_sensor_events_device_recorded_at
  ON sensor_events (device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_events_topic_recorded_at
  ON sensor_events (topic, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_events_payload_gin
  ON sensor_events
  USING GIN (payload);

CREATE TABLE IF NOT EXISTS controller_devices (
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  display_name TEXT,
  command_topic TEXT,
  last_seen_at TIMESTAMPTZ,
  last_birth_at TIMESTAMPTZ,
  last_death_at TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, edge_node_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_controller_devices_last_seen
  ON controller_devices (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS metric_readings (
  id BIGSERIAL,
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value_double DOUBLE PRECISION,
  value_text TEXT,
  unit TEXT,
  quality TEXT NOT NULL DEFAULT 'good',
  source_model TEXT,
  source_channel TEXT,
  raw_event_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
);

SELECT create_hypertable(
  'metric_readings',
  'recorded_at',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_metric_readings_lookup
  ON metric_readings (group_id, edge_node_id, device_id, metric_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_readings_payload_gin
  ON metric_readings
  USING GIN (payload);

CREATE TABLE IF NOT EXISTS controller_status (
  id BIGSERIAL,
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  mode TEXT,
  enabled BOOLEAN,
  ready_for_control BOOLEAN,
  safety_shutdown BOOLEAN,
  reason_mask BIGINT,
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, recorded_at)
);

SELECT create_hypertable(
  'controller_status',
  'recorded_at',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_controller_status_latest
  ON controller_status (group_id, edge_node_id, device_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS controller_config_revisions (
  id BIGSERIAL PRIMARY KEY,
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  config JSONB NOT NULL,
  changed_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  command_topic TEXT,
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  CHECK (status IN ('pending', 'sent', 'confirmed', 'rejected', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_controller_config_revisions_device
  ON controller_config_revisions (group_id, edge_node_id, device_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS controller_config_current (
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  revision_id BIGINT REFERENCES controller_config_revisions(id),
  config JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'reported',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, edge_node_id, device_id)
);

CREATE TABLE IF NOT EXISTS controller_calendars (
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  revision_id BIGINT REFERENCES controller_config_revisions(id),
  calendar JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, edge_node_id, device_id)
);

CREATE TABLE IF NOT EXISTS controller_schedule_points (
  id BIGSERIAL PRIMARY KEY,
  group_id TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  revision_id BIGINT REFERENCES controller_config_revisions(id),
  parameter TEXT NOT NULL,
  day_mask SMALLINT NOT NULL,
  minute_of_day SMALLINT NOT NULL,
  value_double DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (day_mask BETWEEN 1 AND 127),
  CHECK (minute_of_day BETWEEN 0 AND 1439)
);

CREATE INDEX IF NOT EXISTS idx_controller_schedule_points_device
  ON controller_schedule_points (group_id, edge_node_id, device_id, parameter);
