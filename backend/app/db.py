from contextlib import contextmanager

from psycopg import connect

from app.config import settings


@contextmanager
def get_connection():
    with connect(settings.postgres_dsn) as connection:
        yield connection

