from __future__ import annotations

from dataclasses import dataclass

from psycopg import sql

from app.config import settings
from app.db import get_connection
from app.security import hash_password, verify_password


@dataclass
class UserRecord:
    id: int
    username: str
    password_hash: str
    role: str
    is_active: bool


def ensure_users_table() -> None:
    query = sql.SQL(
        """
        CREATE TABLE IF NOT EXISTS {table} (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (role IN ('admin', 'viewer'))
        )
        """
    ).format(table=sql.Identifier(settings.users_table))

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
        connection.commit()


def ensure_admin_user() -> None:
    ensure_users_table()
    existing_user = get_user_by_username(settings.app_admin_username)
    if existing_user is not None:
        return

    create_user(
        username=settings.app_admin_username,
        password=settings.app_admin_password,
        role="admin",
    )


def get_user_by_username(username: str) -> UserRecord | None:
    query = sql.SQL(
        """
        SELECT id, username, password_hash, role, is_active
        FROM {table}
        WHERE username = %s
        """
    ).format(table=sql.Identifier(settings.users_table))

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (username,))
            row = cursor.fetchone()

    if row is None:
        return None

    return UserRecord(
        id=row[0],
        username=row[1],
        password_hash=row[2],
        role=row[3],
        is_active=row[4],
    )


def authenticate_user(username: str, password: str) -> UserRecord | None:
    user = get_user_by_username(username)
    if user is None or not user.is_active:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


def list_users() -> list[dict[str, object]]:
    query = sql.SQL(
        """
        SELECT id, username, role, is_active, created_at, updated_at
        FROM {table}
        ORDER BY username
        """
    ).format(table=sql.Identifier(settings.users_table))

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()

    return [
        {
            "id": row[0],
            "username": row[1],
            "role": row[2],
            "is_active": row[3],
            "created_at": row[4].isoformat(),
            "updated_at": row[5].isoformat(),
        }
        for row in rows
    ]


def create_user(username: str, password: str, role: str = "viewer") -> dict[str, object]:
    password_hash = hash_password(password)
    query = sql.SQL(
        """
        INSERT INTO {table} (username, password_hash, role)
        VALUES (%s, %s, %s)
        RETURNING id, username, role, is_active, created_at, updated_at
        """
    ).format(table=sql.Identifier(settings.users_table))

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (username, password_hash, role))
            row = cursor.fetchone()
        connection.commit()

    return {
        "id": row[0],
        "username": row[1],
        "role": row[2],
        "is_active": row[3],
        "created_at": row[4].isoformat(),
        "updated_at": row[5].isoformat(),
    }


def update_user(
    username: str,
    *,
    password: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
) -> dict[str, object] | None:
    assignments: list[sql.Composed] = []
    parameters: list[object] = []

    if password is not None:
        assignments.append(sql.SQL("password_hash = %s"))
        parameters.append(hash_password(password))

    if role is not None:
        assignments.append(sql.SQL("role = %s"))
        parameters.append(role)

    if is_active is not None:
        assignments.append(sql.SQL("is_active = %s"))
        parameters.append(is_active)

    if not assignments:
        existing = get_user_by_username(username)
        if existing is None:
            return None
        return {
            "id": existing.id,
            "username": existing.username,
            "role": existing.role,
            "is_active": existing.is_active,
            "created_at": "",
            "updated_at": "",
        }

    assignments.append(sql.SQL("updated_at = NOW()"))
    query = sql.SQL(
        """
        UPDATE {table}
        SET {assignments}
        WHERE username = %s
        RETURNING id, username, role, is_active, created_at, updated_at
        """
    ).format(
        table=sql.Identifier(settings.users_table),
        assignments=sql.SQL(", ").join(assignments),
    )

    parameters.append(username)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, parameters)
            row = cursor.fetchone()
        connection.commit()

    if row is None:
        return None

    return {
        "id": row[0],
        "username": row[1],
        "role": row[2],
        "is_active": row[3],
        "created_at": row[4].isoformat(),
        "updated_at": row[5].isoformat(),
    }
