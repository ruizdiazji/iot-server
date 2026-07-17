from pydantic import BaseModel
import os


class Settings(BaseModel):
    postgres_host: str = os.getenv("POSTGRES_HOST", "timescaledb")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_db: str = os.getenv("POSTGRES_DB", "mqtt")
    postgres_user: str = os.getenv("POSTGRES_USER", "postgres")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "postgres")

    app_secret_key: str = os.getenv("APP_SECRET_KEY", "change-this-secret")
    app_admin_username: str = os.getenv(
        "APP_ADMIN_USERNAME", os.getenv("APP_USER", "admin")
    )
    app_admin_password: str = os.getenv(
        "APP_ADMIN_PASSWORD", os.getenv("APP_PASSWORD", "admin123")
    )

    topics_table: str = os.getenv("TOPICS_TABLE", "mqtt_messages")
    topics_timestamp_column: str = os.getenv("TOPICS_TIMESTAMP_COLUMN", "time")
    topics_name_column: str = os.getenv("TOPICS_NAME_COLUMN", "topic")
    topics_value_column: str = os.getenv("TOPICS_VALUE_COLUMN", "value")

    access_token_exp_minutes: int = 60 * 12
    users_table: str = os.getenv("USERS_TABLE", "dashboard_users")

    mqtt_host: str = os.getenv("MQTT_HOST", "localhost")
    mqtt_port: int = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_username: str | None = os.getenv("MQTT_USERNAME") or None
    mqtt_password: str | None = os.getenv("MQTT_PASSWORD") or None
    default_command_topic: str = os.getenv("DEFAULT_COMMAND_TOPIC", "central_controller/sensors/cmd")

    @property
    def postgres_dsn(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
