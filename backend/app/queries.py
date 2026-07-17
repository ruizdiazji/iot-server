import json
from datetime import datetime
from typing import Any

import paho.mqtt.publish as mqtt_publish
from psycopg import sql

from app.config import settings
from app.db import get_connection


ALLOWED_BUCKETS = {
    "1 second",
    "10 seconds",
    "30 seconds",
    "1 minute",
    "5 minutes",
    "15 minutes",
    "1 hour",
}

PROCESS_SERIES = {
    "temperature": [
        {"key": "measured", "label": "Temperatura medida", "device_id": "environment", "metric_name": "temperature_c", "unit": "C"},
        {"key": "setpoint", "label": "Setpoint", "device_id": "control", "metric_name": "setpoint/temperature", "unit": "C"},
        {"key": "heater", "label": "Heater", "device_id": "control", "metric_name": "applied_output/heater", "unit": "%"},
        {"key": "cooler", "label": "Cooler", "device_id": "control", "metric_name": "applied_output/cooler", "unit": "%"},
    ],
    "humidity": [
        {"key": "measured", "label": "Humedad medida", "device_id": "environment", "metric_name": "humidity_pct", "unit": "%"},
        {"key": "setpoint", "label": "Setpoint", "device_id": "control", "metric_name": "setpoint/humidity", "unit": "%"},
        {"key": "humidifier", "label": "Humidifier", "device_id": "control", "metric_name": "applied_output/humidifier", "unit": "%"},
        {"key": "extractor", "label": "Extractor", "device_id": "control", "metric_name": "applied_output/extractor", "unit": "%"},
    ],
    "co2": [
        {"key": "measured", "label": "CO2 medido", "device_id": "environment", "metric_name": "co2_ppm", "unit": "ppm"},
        {"key": "setpoint", "label": "Setpoint", "device_id": "control", "metric_name": "setpoint/co2", "unit": "ppm"},
        {"key": "injection", "label": "Inyeccion CO2", "device_id": "control", "metric_name": "applied_output/co2", "unit": "%"},
        {"key": "extractor", "label": "Extractor", "device_id": "control", "metric_name": "applied_output/extractor", "unit": "%"},
    ],
    "light": [
        {"key": "measured", "label": "Luz medida", "device_id": "environment", "metric_name": "light_lux", "unit": "lux"},
        {"key": "setpoint", "label": "Setpoint", "device_id": "control", "metric_name": "setpoint/light", "unit": "lux"},
        {"key": "light_output", "label": "Salida luz", "device_id": "control", "metric_name": "applied_output/light", "unit": "%"},
    ],
    "energy": [
        {"key": "power", "label": "Potencia activa", "device_id": "energy", "metric_name": "power_w", "unit": "W"},
        {"key": "energy_wh", "label": "Energia acumulada", "device_id": "energy", "metric_name": "energy_wh", "unit": "Wh"},
        {"key": "voltage", "label": "Tension", "device_id": "energy", "metric_name": "voltage_v", "unit": "V"},
        {"key": "current", "label": "Corriente", "device_id": "energy", "metric_name": "current_a", "unit": "A"},
        {"key": "power_factor", "label": "Factor de potencia", "device_id": "energy", "metric_name": "power_factor", "unit": None},
    ],
}


def list_topics() -> list[str]:
    query = sql.SQL(
        """
        SELECT DISTINCT {topic_column}
        FROM {table}
        ORDER BY {topic_column}
        """
    ).format(
        topic_column=sql.Identifier(settings.topics_name_column),
        table=sql.Identifier(settings.topics_table),
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            return [row[0] for row in cursor.fetchall()]


def get_timeseries(topic: str, start: datetime, end: datetime, bucket: str):
    if bucket not in ALLOWED_BUCKETS:
        raise ValueError(f"Unsupported bucket: {bucket}")

    query = sql.SQL(
        """
        SELECT
            time_bucket(%s, {timestamp_column}) AS bucket_time,
            AVG({value_column})::double precision AS avg_value
        FROM {table}
        WHERE {topic_column} = %s
          AND {timestamp_column} >= %s
          AND {timestamp_column} <= %s
        GROUP BY bucket_time
        ORDER BY bucket_time
        """
    ).format(
        timestamp_column=sql.Identifier(settings.topics_timestamp_column),
        value_column=sql.Identifier(settings.topics_value_column),
        table=sql.Identifier(settings.topics_table),
        topic_column=sql.Identifier(settings.topics_name_column),
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (bucket, topic, start, end))
            rows = cursor.fetchall()

    return [{"ts": row[0].isoformat(), "value": float(row[1])} for row in rows]


def ensure_observability_tables() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE EXTENSION IF NOT EXISTS timescaledb;

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
                SELECT create_hypertable('metric_readings', 'recorded_at', if_not_exists => TRUE);

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
                SELECT create_hypertable('controller_status', 'recorded_at', if_not_exists => TRUE);

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
                """
            )
        connection.commit()


def list_devices() -> list[dict[str, object]]:
    query = """
        SELECT group_id, edge_node_id, device_id, display_name, command_topic,
               is_online, last_seen_at
        FROM controller_devices
        ORDER BY group_id, edge_node_id, device_id
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()

    return [
        {
            "group_id": row[0],
            "edge_node_id": row[1],
            "device_id": row[2],
            "display_name": row[3],
            "command_topic": row[4],
            "is_online": row[5],
            "last_seen_at": row[6].isoformat() if row[6] else None,
        }
        for row in rows
    ]


def list_metrics(group_id: str, edge_node_id: str) -> list[dict[str, object]]:
    query = """
        SELECT DISTINCT ON (device_id, metric_name)
               device_id, metric_name, unit, source_model, source_channel,
               value_double, value_text, recorded_at
        FROM metric_readings
        WHERE group_id = %s AND edge_node_id = %s
        ORDER BY device_id, metric_name, recorded_at DESC
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id))
            rows = cursor.fetchall()

    return [
        {
            "device_id": row[0],
            "metric_name": row[1],
            "unit": row[2],
            "source_model": row[3],
            "source_channel": row[4],
            "last_value": float(row[5]) if row[5] is not None else row[6],
            "last_recorded_at": row[7].isoformat() if row[7] else None,
        }
        for row in rows
    ]


def get_metric_timeseries(
    group_id: str,
    edge_node_id: str,
    device_id: str,
    metric_name: str,
    start: datetime,
    end: datetime,
    bucket: str,
) -> list[dict[str, object]]:
    if bucket not in ALLOWED_BUCKETS:
        raise ValueError(f"Unsupported bucket: {bucket}")

    query = """
        SELECT time_bucket(%s, recorded_at) AS bucket_time,
               AVG(value_double)::double precision AS avg_value
        FROM metric_readings
        WHERE group_id = %s
          AND edge_node_id = %s
          AND device_id = %s
          AND metric_name = %s
          AND value_double IS NOT NULL
          AND recorded_at >= %s
          AND recorded_at <= %s
        GROUP BY bucket_time
        ORDER BY bucket_time
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (bucket, group_id, edge_node_id, device_id, metric_name, start, end))
            rows = cursor.fetchall()

    return [{"ts": row[0].isoformat(), "value": float(row[1])} for row in rows if row[1] is not None]


def get_process_timeseries(
    group_id: str,
    edge_node_id: str,
    process: str,
    start: datetime,
    end: datetime,
    bucket: str,
) -> list[dict[str, object]]:
    if bucket not in ALLOWED_BUCKETS:
        raise ValueError(f"Unsupported bucket: {bucket}")
    if process not in PROCESS_SERIES:
        raise ValueError(f"Unsupported process: {process}")

    series = []
    for definition in PROCESS_SERIES[process]:
        points = get_metric_timeseries(
            group_id,
            edge_node_id,
            str(definition["device_id"]),
            str(definition["metric_name"]),
            start,
            end,
            bucket,
        )
        series.append(
            {
                "key": definition["key"],
                "label": definition["label"],
                "unit": definition["unit"],
                "points": points,
            }
        )

    return series


def get_latest_status(group_id: str, edge_node_id: str, device_id: str = "control") -> dict[str, object]:
    query = """
        SELECT recorded_at, payload
        FROM controller_status
        WHERE group_id = %s AND edge_node_id = %s AND device_id = %s
        ORDER BY recorded_at DESC
        LIMIT 1
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id, device_id))
            row = cursor.fetchone()

    if row is None:
        return {
            "group_id": group_id,
            "edge_node_id": edge_node_id,
            "device_id": device_id,
            "recorded_at": None,
            "payload": None,
        }

    return {
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "device_id": device_id,
        "recorded_at": row[0].isoformat(),
        "payload": row[1],
    }


def get_overview(group_id: str, edge_node_id: str) -> dict[str, object]:
    overview_metrics = {
        "environment": ("temperature_c", "humidity_pct", "co2_ppm", "light_lux"),
        "energy": ("power_w", "energy_wh", "energy_kwh", "voltage_v", "current_a", "power_factor"),
    }
    query = """
        SELECT DISTINCT ON (device_id, metric_name)
               device_id, metric_name, value_double, value_text, unit, source_model, source_channel, recorded_at
        FROM metric_readings
        WHERE group_id = %s
          AND edge_node_id = %s
          AND (
            (device_id = 'environment' AND metric_name = ANY(%s))
            OR (device_id = 'energy' AND metric_name = ANY(%s))
          )
        ORDER BY device_id, metric_name, recorded_at DESC
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                query,
                (
                    group_id,
                    edge_node_id,
                    list(overview_metrics["environment"]),
                    list(overview_metrics["energy"]),
                ),
            )
            rows = cursor.fetchall()

    status = get_latest_status(group_id, edge_node_id)
    return {
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "environment": [
            {
                "device_id": row[0],
                "metric_name": row[1],
                "value": float(row[2]) if row[2] is not None else row[3],
                "unit": row[4],
                "source_model": row[5],
                "source_channel": row[6],
                "recorded_at": row[7].isoformat() if row[7] else None,
            }
            for row in rows
        ],
        "status": status["payload"],
    }


def get_current_config(group_id: str, edge_node_id: str, device_id: str = "control") -> dict[str, object]:
    query = """
        SELECT config, source, updated_at, confirmed_at
        FROM controller_config_current
        WHERE group_id = %s AND edge_node_id = %s AND device_id = %s
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id, device_id))
            row = cursor.fetchone()

    if row is None:
        return {
            "group_id": group_id,
            "edge_node_id": edge_node_id,
            "device_id": device_id,
            "config": None,
            "source": None,
            "updated_at": None,
            "confirmed_at": None,
        }

    return {
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "device_id": device_id,
        "config": row[0],
        "source": row[1],
        "updated_at": row[2].isoformat() if row[2] else None,
        "confirmed_at": row[3].isoformat() if row[3] else None,
    }


def list_config_history(group_id: str, edge_node_id: str, device_id: str = "control") -> list[dict[str, object]]:
    query = """
        SELECT id, group_id, edge_node_id, device_id, config, changed_by,
               status, command_topic, error, requested_at, confirmed_at
        FROM controller_config_revisions
        WHERE group_id = %s AND edge_node_id = %s AND device_id = %s
        ORDER BY requested_at DESC
        LIMIT 50
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id, device_id))
            rows = cursor.fetchall()

    return [
        {
            "id": row[0],
            "group_id": row[1],
            "edge_node_id": row[2],
            "device_id": row[3],
            "config": row[4],
            "changed_by": row[5],
            "status": row[6],
            "command_topic": row[7],
            "error": row[8],
            "requested_at": row[9].isoformat(),
            "confirmed_at": row[10].isoformat() if row[10] else None,
        }
        for row in rows
    ]


def get_command_topic(group_id: str, edge_node_id: str, device_id: str = "control") -> str:
    query = """
        SELECT command_topic
        FROM controller_devices
        WHERE group_id = %s AND edge_node_id = %s AND device_id = %s
        LIMIT 1
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id, device_id))
            row = cursor.fetchone()

    return row[0] if row and row[0] else settings.default_command_topic


def publish_config_update(
    group_id: str,
    edge_node_id: str,
    device_id: str,
    config: dict[str, Any],
    save: bool,
    changed_by: str,
) -> dict[str, object]:
    command_topic = get_command_topic(group_id, edge_node_id, device_id)
    command_payload = {**config, "save": save}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO controller_config_revisions (
                  group_id, edge_node_id, device_id, config, changed_by, status, command_topic
                )
                VALUES (%s, %s, %s, %s::jsonb, %s, 'pending', %s)
                RETURNING id, requested_at
                """,
                (group_id, edge_node_id, device_id, json.dumps(command_payload), changed_by, command_topic),
            )
            revision_id, requested_at = cursor.fetchone()
        connection.commit()

    try:
        auth = None
        if settings.mqtt_username:
            auth = {"username": settings.mqtt_username, "password": settings.mqtt_password}
        mqtt_publish.single(
            command_topic,
            payload=json.dumps(command_payload),
            qos=1,
            retain=False,
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            auth=auth,
        )
        status_value = "sent"
        error = None
    except Exception as exc:
        status_value = "failed"
        error = str(exc)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE controller_config_revisions
                SET status = %s, error = %s
                WHERE id = %s
                """,
                (status_value, error, revision_id),
            )
            cursor.execute(
                """
                INSERT INTO controller_config_current (
                  group_id, edge_node_id, device_id, revision_id, config, source, updated_at
                )
                VALUES (%s, %s, %s, %s, %s::jsonb, 'dashboard_pending', NOW())
                ON CONFLICT (group_id, edge_node_id, device_id)
                DO UPDATE SET
                  revision_id = EXCLUDED.revision_id,
                  config = EXCLUDED.config,
                  source = EXCLUDED.source,
                  updated_at = NOW()
                """,
                (group_id, edge_node_id, device_id, revision_id, json.dumps(command_payload)),
            )
        connection.commit()

    return {
        "id": revision_id,
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "device_id": device_id,
        "config": command_payload,
        "changed_by": changed_by,
        "status": status_value,
        "command_topic": command_topic,
        "error": error,
        "requested_at": requested_at.isoformat(),
        "confirmed_at": None,
    }


def get_current_calendar(group_id: str, edge_node_id: str, device_id: str = "control") -> dict[str, object]:
    query = """
        SELECT calendar, source, updated_at, revision_id
        FROM controller_calendars
        WHERE group_id = %s AND edge_node_id = %s AND device_id = %s
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (group_id, edge_node_id, device_id))
            row = cursor.fetchone()

    if row is None:
        return {
            "group_id": group_id,
            "edge_node_id": edge_node_id,
            "device_id": device_id,
            "calendar": None,
            "source": None,
            "updated_at": None,
            "revision_id": None,
        }

    return {
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "device_id": device_id,
        "calendar": row[0],
        "source": row[1],
        "updated_at": row[2].isoformat() if row[2] else None,
        "revision_id": row[3],
    }


def publish_calendar_update(
    group_id: str,
    edge_node_id: str,
    device_id: str,
    calendar: dict[str, Any],
    save: bool,
    changed_by: str,
) -> dict[str, object]:
    command_topic = get_command_topic(group_id, edge_node_id, device_id)
    command_payload = {
        "command": "calendar_update",
        "calendar": calendar,
        "save": save,
    }

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO controller_config_revisions (
                  group_id, edge_node_id, device_id, config, changed_by, status, command_topic
                )
                VALUES (%s, %s, %s, %s::jsonb, %s, 'pending', %s)
                RETURNING id, requested_at
                """,
                (group_id, edge_node_id, device_id, json.dumps(command_payload), changed_by, command_topic),
            )
            revision_id, requested_at = cursor.fetchone()
            cursor.execute(
                """
                INSERT INTO controller_calendars (
                  group_id, edge_node_id, device_id, revision_id, calendar, source, updated_at
                )
                VALUES (%s, %s, %s, %s, %s::jsonb, 'dashboard', NOW())
                ON CONFLICT (group_id, edge_node_id, device_id)
                DO UPDATE SET
                  revision_id = EXCLUDED.revision_id,
                  calendar = EXCLUDED.calendar,
                  source = 'dashboard',
                  updated_at = EXCLUDED.updated_at
                """,
                (group_id, edge_node_id, device_id, revision_id, json.dumps(calendar)),
            )
        connection.commit()

    try:
        auth = None
        if settings.mqtt_username:
            auth = {"username": settings.mqtt_username, "password": settings.mqtt_password}
        mqtt_publish.single(
            command_topic,
            payload=json.dumps(command_payload),
            qos=1,
            retain=False,
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            auth=auth,
        )
        status_value = "sent"
        error = None
    except Exception as exc:
        status_value = "failed"
        error = str(exc)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE controller_config_revisions
                SET status = %s, error = %s
                WHERE id = %s
                """,
                (status_value, error, revision_id),
            )
        connection.commit()

    return {
        "id": revision_id,
        "group_id": group_id,
        "edge_node_id": edge_node_id,
        "device_id": device_id,
        "config": command_payload,
        "changed_by": changed_by,
        "status": status_value,
        "command_topic": command_topic,
        "error": error,
        "requested_at": requested_at.isoformat(),
        "confirmed_at": None,
    }
