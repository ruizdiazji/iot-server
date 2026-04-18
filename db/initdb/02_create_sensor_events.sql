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