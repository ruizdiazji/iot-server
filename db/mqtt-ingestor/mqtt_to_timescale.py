#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
import psycopg


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "sensors/#")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://edge:cambia_esta_password@localhost:5432/edge_data",
)

METADATA_FIELDS = {
    "addr",
    "device_id",
    "sensor",
    "sensor_name",
    "timestamp",
    "unit",
}


def parse_timestamp(value: Any) -> datetime:
    if value in (None, ""):
        return datetime.now(timezone.utc)

    if isinstance(value, (int, float)):
        timestamp = float(value)

        # Accept Unix timestamps commonly emitted by embedded devices:
        # seconds, milliseconds, microseconds, or nanoseconds.
        if timestamp > 1_000_000_000_000_000_000:
            timestamp = timestamp / 1_000_000_000
        elif timestamp > 1_000_000_000_000_000:
            timestamp = timestamp / 1_000_000
        elif timestamp > 1_000_000_000_000:
            timestamp = timestamp / 1_000

        try:
            parsed = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return datetime.now(timezone.utc)

        if parsed.year < 2000 or parsed.year > 2100:
            return datetime.now(timezone.utc)

        return parsed

    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        try:
            return parse_timestamp(float(normalized))
        except ValueError:
            pass

        try:
            return datetime.fromisoformat(normalized)
        except (OverflowError, OSError, ValueError):
            return datetime.now(timezone.utc)

    return datetime.now(timezone.utc)


def normalize_payload(topic: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    topic_parts = topic.split("/")
    fallback_device_id = topic_parts[1] if len(topic_parts) > 1 else "unknown"
    fallback_sensor_name = topic_parts[2] if len(topic_parts) > 2 else None

    base_data = {
        "device_id": str(payload.get("device_id") or fallback_device_id),
        "unit": payload.get("unit"),
        "payload": json.dumps(payload),
        "recorded_at": parse_timestamp(payload.get("timestamp")),
    }

    if "value" in payload:
        raw_value = payload.get("value")
        value_double = raw_value if isinstance(raw_value, (int, float)) else None
        value_text = None if value_double is not None else str(raw_value) if raw_value is not None else None

        return [
            {
                **base_data,
                "topic": topic,
                "sensor_name": payload.get("sensor") or payload.get("sensor_name") or fallback_sensor_name,
                "value_double": value_double,
                "value_text": value_text,
            }
        ]

    measurements = [
        (key, value)
        for key, value in payload.items()
        if key not in METADATA_FIELDS and isinstance(value, (int, float))
    ]

    if not measurements:
        return [
            {
                **base_data,
                "topic": topic,
                "sensor_name": payload.get("sensor") or payload.get("sensor_name") or fallback_sensor_name,
                "value_double": None,
                "value_text": None,
            }
        ]

    return [
        {
            **base_data,
            "topic": f"{topic}/{measurement_name}",
            "sensor_name": measurement_name,
            "value_double": measurement_value,
            "value_text": None,
        }
        for measurement_name, measurement_value in measurements
    ]


def insert_message(conn: psycopg.Connection, msg: mqtt.MQTTMessage) -> None:
    decoded = msg.payload.decode("utf-8")
    payload = json.loads(decoded)
    measurements = normalize_payload(msg.topic, payload)

    with conn.cursor() as cur:
        for data in measurements:
            cur.execute(
                """
                INSERT INTO sensor_events (
                  topic,
                  device_id,
                  sensor_name,
                  value_double,
                  value_text,
                  unit,
                  qos,
                  retained,
                  payload,
                  recorded_at
                )
                VALUES (
                  %(topic)s,
                  %(device_id)s,
                  %(sensor_name)s,
                  %(value_double)s,
                  %(value_text)s,
                  %(unit)s,
                  %(qos)s,
                  %(retained)s,
                  %(payload)s::jsonb,
                  %(recorded_at)s
                )
                """,
                {
                    **data,
                    "qos": msg.qos,
                    "retained": msg.retain,
                },
            )
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
