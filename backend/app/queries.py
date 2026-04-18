from datetime import datetime

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

