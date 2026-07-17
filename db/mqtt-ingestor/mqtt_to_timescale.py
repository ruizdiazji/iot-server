#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
import psycopg


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "central_controller/#")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://edge:cambia_esta_password@localhost:5432/edge_data",
)
DEFAULT_GROUP_ID = os.getenv("SPARKPLUG_GROUP_ID", "central_controller")
DEFAULT_EDGE_NODE_ID = os.getenv("SPARKPLUG_EDGE_NODE_ID", "esp32-central-01")


@dataclass(frozen=True)
class TopicContext:
    group_id: str
    edge_node_id: str
    device_id: str
    message_type: str
    legacy_base_topic: str | None
    legacy_suffix: str | None


@dataclass(frozen=True)
class Metric:
    device_id: str
    metric_name: str
    value: Any
    unit: str | None = None
    quality: str = "good"
    source_model: str | None = None
    source_channel: str | None = None
    payload: dict[str, Any] | None = None


def parse_timestamp(value: Any, fallback: datetime | None = None) -> datetime:
    if fallback is None:
        fallback = datetime.now(timezone.utc)

    if value in (None, ""):
        return fallback

    if isinstance(value, (int, float)):
        if value <= 0:
            return fallback
        return datetime.fromtimestamp(value, tz=timezone.utc)

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)

    return fallback


def parse_topic(topic: str, payload: dict[str, Any]) -> TopicContext:
    parts = topic.split("/")
    if len(parts) >= 4 and parts[0] == "spBv1.0":
        return TopicContext(
            group_id=parts[1],
            message_type=parts[2],
            edge_node_id=parts[3],
            device_id=parts[4] if len(parts) > 4 else str(payload.get("device_id") or "node"),
            legacy_base_topic=None,
            legacy_suffix=None,
        )

    suffix = parts[-1] if parts else None
    base_topic = "/".join(parts[:-1]) if len(parts) > 1 else topic
    device_id = "control" if suffix in {"status", "config", "config_ack"} else "environment"
    return TopicContext(
        group_id=str(payload.get("group_id") or DEFAULT_GROUP_ID),
        edge_node_id=str(payload.get("edge_node_id") or DEFAULT_EDGE_NODE_ID),
        device_id=str(payload.get("device_id") or device_id),
        message_type=str(payload.get("message_type") or suffix or "data"),
        legacy_base_topic=base_topic,
        legacy_suffix=suffix,
    )


def metric_value_parts(value: Any) -> tuple[float | None, str | None]:
    if isinstance(value, bool):
        return float(int(value)), None
    if isinstance(value, (int, float)):
        return float(value), None
    if value is None:
        return None, None
    return None, str(value)


def bool_or_none(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "si", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def source_channel(payload: dict[str, Any], default: str | None = None) -> str | None:
    if "source_channel" in payload:
        return str(payload["source_channel"])
    if "addr" in payload:
        return f"addr:{payload['addr']}"
    if "address" in payload:
        return f"addr:{payload['address']}"
    return default


def current_firmware_metrics(ctx: TopicContext, payload: dict[str, Any]) -> list[Metric]:
    sensor = str(payload.get("sensor") or ctx.legacy_suffix or "").lower()
    metrics: list[Metric] = []

    if sensor == "thmb02s":
        if "temperature" in payload:
            metrics.append(
                Metric(
                    device_id="environment",
                    metric_name="temperature_c",
                    value=payload["temperature"],
                    unit="C",
                    source_model="thmb02s",
                    source_channel=source_channel(payload),
                    payload=payload,
                )
            )
        if "humidity" in payload:
            metrics.append(
                Metric(
                    device_id="environment",
                    metric_name="humidity_pct",
                    value=payload["humidity"],
                    unit="%",
                    source_model="thmb02s",
                    source_channel=source_channel(payload),
                    payload=payload,
                )
            )
        return metrics

    if sensor == "tsl2591" and "lux" in payload:
        return [
            Metric(
                device_id="environment",
                metric_name="light_lux",
                value=payload["lux"],
                unit="lux",
                source_model="tsl2591",
                payload=payload,
            )
        ]

    if sensor == "mhz19b" and "co2" in payload:
        return [
            Metric(
                device_id="environment",
                metric_name="co2_ppm",
                value=payload["co2"],
                unit=payload.get("unit") or "ppm",
                source_model="mhz19b",
                source_channel=source_channel(payload),
                payload=payload,
            )
        ]

    if sensor == "hlw8032":
        metric_map = [
            (("power_w", "power", "active_power", "active_power_w"), "power_w", "W"),
            (("voltage_v", "voltage", "voltage_rms", "rms_voltage"), "voltage_v", "V"),
            (("current_a", "current", "current_rms", "rms_current"), "current_a", "A"),
            (("energy_wh", "energy", "energy_wh"), "energy_wh", "Wh"),
            (("energy_kwh", "kwh", "energy_kwh"), "energy_kwh", "kWh"),
            (("power_factor", "pf"), "power_factor", None),
            (("frequency_hz", "frequency", "freq"), "frequency_hz", "Hz"),
        ]
        for source_keys, metric_name, unit in metric_map:
            for source_key in source_keys:
                if source_key in payload:
                    metrics.append(
                        Metric(
                            device_id="energy",
                            metric_name=metric_name,
                            value=payload[source_key],
                            unit=payload.get(f"{source_key}_unit") or unit,
                            source_model="hlw8032",
                            source_channel=source_channel(payload),
                            payload={source_key: payload[source_key]},
                        )
                    )
                    break
        return metrics

    return metrics


def status_metrics(payload: dict[str, Any]) -> list[Metric]:
    metrics: list[Metric] = []
    sections = {
        "input": "input",
        "setpoint": "setpoint",
        "scheduled": "scheduled",
        "requested": "requested_output",
        "applied": "applied_output",
        "sensor_ok": "sensor_ok",
        "sensor_age_ms": "sensor_age_ms",
    }

    for section, prefix in sections.items():
        value = payload.get(section)
        if not isinstance(value, dict):
            continue
        for name, item in value.items():
            metrics.append(
                Metric(
                    device_id="control",
                    metric_name=f"{prefix}/{name}",
                    value=item,
                    payload={section: {name: item}},
                )
            )

    for name in ("enabled", "ready_for_control", "safety_shutdown", "reason_mask", "time_valid", "heap_free"):
        if name in payload:
            metrics.append(Metric(device_id="control", metric_name=name, value=payload[name], payload={name: payload[name]}))

    if "mode" in payload:
        mode_value = payload["mode"]
        mode_text = {0: "auto", 1: "safe", 2: "manual"}.get(mode_value, str(mode_value))
        metrics.append(Metric(device_id="control", metric_name="mode", value=mode_text, payload={"mode": mode_value}))

    return metrics


def explicit_metrics(ctx: TopicContext, payload: dict[str, Any]) -> list[Metric]:
    raw_metrics = payload.get("metrics")
    if not isinstance(raw_metrics, list):
        return []

    metrics: list[Metric] = []
    for item in raw_metrics:
        if not isinstance(item, dict) or "name" not in item:
            continue
        metrics.append(
            Metric(
                device_id=str(item.get("device_id") or payload.get("device_id") or ctx.device_id),
                metric_name=str(item["name"]),
                value=item.get("value"),
                unit=item.get("unit"),
                quality=str(item.get("quality") or "good"),
                source_model=item.get("source_model") or payload.get("source_model"),
                source_channel=item.get("source_channel") or payload.get("source_channel"),
                payload=item,
            )
        )
    return metrics


def extract_metrics(ctx: TopicContext, payload: dict[str, Any]) -> list[Metric]:
    metrics = explicit_metrics(ctx, payload)
    if metrics:
        return metrics

    if ctx.legacy_suffix == "status" or ctx.message_type in {"status", "NDATA"} and "input" in payload:
        return status_metrics(payload)

    return current_firmware_metrics(ctx, payload)


def recorded_at_for_message(payload: dict[str, Any], received_at: datetime) -> datetime:
    if "timestamp" in payload:
        return parse_timestamp(payload.get("timestamp"), received_at)
    if "unix_time" in payload and payload.get("time_valid"):
        return parse_timestamp(payload.get("unix_time"), received_at)
    return received_at


def first_metric_value(metrics: list[Metric]) -> tuple[float | None, str | None, str | None]:
    for metric in metrics:
        value_double, value_text = metric_value_parts(metric.value)
        if value_double is not None or value_text is not None:
            return value_double, value_text, metric.unit
    return None, None, None


def ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
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
            """
        )
    conn.commit()


def upsert_device(conn: psycopg.Connection, ctx: TopicContext, device_id: str, recorded_at: datetime, payload: dict[str, Any]) -> None:
    command_topic = None
    if ctx.legacy_base_topic:
        command_topic = f"{ctx.legacy_base_topic}/cmd"
    elif ctx.message_type.startswith("D"):
        command_topic = f"spBv1.0/{ctx.group_id}/DCMD/{ctx.edge_node_id}/{device_id}"
    else:
        command_topic = f"spBv1.0/{ctx.group_id}/NCMD/{ctx.edge_node_id}"

    is_birth = ctx.message_type in {"NBIRTH", "DBIRTH", "birth"}
    is_death = ctx.message_type in {"NDEATH", "DDEATH", "death"}
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO controller_devices (
              group_id, edge_node_id, device_id, display_name, command_topic,
              last_seen_at, last_birth_at, last_death_at, is_online, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (group_id, edge_node_id, device_id)
            DO UPDATE SET
              command_topic = COALESCE(EXCLUDED.command_topic, controller_devices.command_topic),
              last_seen_at = EXCLUDED.last_seen_at,
              last_birth_at = COALESCE(EXCLUDED.last_birth_at, controller_devices.last_birth_at),
              last_death_at = COALESCE(EXCLUDED.last_death_at, controller_devices.last_death_at),
              is_online = EXCLUDED.is_online,
              metadata = controller_devices.metadata || EXCLUDED.metadata,
              updated_at = NOW()
            """,
            (
                ctx.group_id,
                ctx.edge_node_id,
                device_id,
                payload.get("display_name"),
                command_topic,
                recorded_at,
                recorded_at if is_birth else None,
                recorded_at if is_death else None,
                not is_death,
                json.dumps({"last_topic": payload.get("_topic"), "source": "mqtt_json"}),
            ),
        )


def insert_raw_event(
    conn: psycopg.Connection,
    msg: mqtt.MQTTMessage,
    ctx: TopicContext,
    payload: dict[str, Any],
    metrics: list[Metric],
    recorded_at: datetime,
) -> int:
    value_double, value_text, unit = first_metric_value(metrics)
    sensor_name = payload.get("sensor") or payload.get("sensor_name") or ctx.legacy_suffix

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sensor_events (
              topic, device_id, sensor_name, value_double, value_text, unit,
              qos, retained, payload, recorded_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            RETURNING id
            """,
            (
                msg.topic,
                ctx.device_id,
                sensor_name,
                value_double,
                value_text,
                unit,
                msg.qos,
                msg.retain,
                json.dumps(payload),
                recorded_at,
            ),
        )
        return int(cur.fetchone()[0])


def insert_metrics(
    conn: psycopg.Connection,
    ctx: TopicContext,
    metrics: list[Metric],
    raw_event_id: int,
    recorded_at: datetime,
) -> None:
    with conn.cursor() as cur:
        for metric in metrics:
            value_double, value_text = metric_value_parts(metric.value)
            cur.execute(
                """
                INSERT INTO metric_readings (
                  group_id, edge_node_id, device_id, metric_name,
                  value_double, value_text, unit, quality, source_model,
                  source_channel, raw_event_id, payload, recorded_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (
                    ctx.group_id,
                    ctx.edge_node_id,
                    metric.device_id,
                    metric.metric_name,
                    value_double,
                    value_text,
                    metric.unit,
                    metric.quality,
                    metric.source_model,
                    metric.source_channel,
                    raw_event_id,
                    json.dumps(metric.payload or {}),
                    recorded_at,
                ),
            )


def insert_status(conn: psycopg.Connection, ctx: TopicContext, payload: dict[str, Any], recorded_at: datetime) -> None:
    mode_value = payload.get("mode")
    mode = {0: "auto", 1: "safe", 2: "manual"}.get(mode_value, str(mode_value) if mode_value is not None else None)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO controller_status (
              group_id, edge_node_id, device_id, mode, enabled, ready_for_control,
              safety_shutdown, reason_mask, payload, recorded_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                ctx.group_id,
                ctx.edge_node_id,
                "control",
                mode,
                bool_or_none(payload.get("enabled")),
                bool_or_none(payload.get("ready_for_control")),
                bool_or_none(payload.get("safety_shutdown")),
                payload.get("reason_mask"),
                json.dumps(payload),
                recorded_at,
            ),
        )


def upsert_reported_config(conn: psycopg.Connection, ctx: TopicContext, payload: dict[str, Any], recorded_at: datetime) -> None:
    config = payload.get("config")
    if not isinstance(config, dict):
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO controller_config_current (
              group_id, edge_node_id, device_id, config, source, updated_at, confirmed_at
            )
            VALUES (%s, %s, %s, %s::jsonb, 'reported', %s, %s)
            ON CONFLICT (group_id, edge_node_id, device_id)
            DO UPDATE SET
              config = EXCLUDED.config,
              source = 'reported',
              updated_at = EXCLUDED.updated_at,
              confirmed_at = EXCLUDED.confirmed_at
            """,
            (ctx.group_id, ctx.edge_node_id, "control", json.dumps(config), recorded_at, recorded_at),
        )


def insert_message(conn: psycopg.Connection, msg: mqtt.MQTTMessage) -> None:
    received_at = datetime.now(timezone.utc)
    decoded = msg.payload.decode("utf-8")
    payload = json.loads(decoded)
    if not isinstance(payload, dict):
        payload = {"value": payload}
    payload["_topic"] = msg.topic

    ctx = parse_topic(msg.topic, payload)
    recorded_at = recorded_at_for_message(payload, received_at)
    metrics = extract_metrics(ctx, payload)
    raw_event_id = insert_raw_event(conn, msg, ctx, payload, metrics, recorded_at)

    device_ids = {metric.device_id for metric in metrics} or {ctx.device_id}
    for device_id in device_ids:
        upsert_device(conn, ctx, device_id, recorded_at, payload)

    insert_metrics(conn, ctx, metrics, raw_event_id, recorded_at)
    if ctx.legacy_suffix == "status" or "ready_for_control" in payload:
        insert_status(conn, ctx, payload, recorded_at)
    upsert_reported_config(conn, ctx, payload, recorded_at)
    conn.commit()


def on_connect(client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: int, _properties: Any = None) -> None:
    if reason_code != 0:
        raise RuntimeError(f"MQTT connect failed with code {reason_code}")
    client.subscribe(MQTT_TOPIC, qos=1)


def on_message(_client: mqtt.Client, userdata: dict[str, Any], msg: mqtt.MQTTMessage) -> None:
    conn = userdata["db_conn"]
    try:
        insert_message(conn, msg)
        print(f"stored {msg.topic}")
    except Exception as exc:
        conn.rollback()
        print(f"failed to store {msg.topic}: {exc}")


def main() -> None:
    conn = psycopg.connect(DATABASE_URL)
    ensure_schema(conn)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.user_data_set({"db_conn": conn})

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_forever()


if __name__ == "__main__":
    main()
