# Dashboard MQTT Web

Base para un dashboard web con:

- `React + TypeScript + Vite` en el frontend
- `FastAPI` en el backend
- `Apache ECharts` para series temporales
- `Nginx` como reverse proxy
- `Postgres/TimescaleDB` como fuente de datos historica

## Estructura

- `frontend/`: cliente web con login y dashboard
- `backend/`: API para autenticacion y consultas a TimescaleDB
- `nginx/`: proxy para servir frontend y enrutar `/api`
- `db/`: TimescaleDB + ingestor MQTT a `sensor_events`
- `servidor-mqtt/`: broker Mosquitto

## Variables de entorno

El archivo raiz `.env` del dashboard esta alineado con el stack `db/`.
Ajustar segun entorno:

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `APP_ADMIN_USERNAME`, `APP_ADMIN_PASSWORD`
- `APP_SECRET_KEY`
- `EDGE_NETWORK`

## Esquema de datos esperado

El backend viene configurado para consultar la tabla real del ingestor:

- `sensor_events`
- columna temporal: `recorded_at`
- columna de topic: `topic`
- columna numerica: `value_double`

Tambien usa una tabla propia para autenticacion:

- `dashboard_users`

El archivo [db/initdb/03_create_dashboard_users.sql](/db/initdb/03_create_dashboard_users.sql:1) la crea en instalaciones nuevas.
Para bases ya existentes, el backend tambien la crea automaticamente al arrancar y genera el admin inicial si no existe.

## Red compartida

Los tres stacks usan la red Docker externa `edge_net`.
Si todavia no existe, crearla una sola vez:

```bash
docker network create edge_net
```

levantar cada stack por separado y todos quedan en la misma red:

```bash
docker compose -f servidor-mqtt/docker-compose.yml --env-file servidor-mqtt/.env up -d
docker compose -f db/docker-compose.yaml --env-file db/.env up -d
docker compose up -d --build
```

## Endpoints principales

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/topics`
- `GET /api/timeseries?topic=...&from=...&to=...&bucket=1 minute`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/{username}`

## Notas de integracion

- El backend consulta directamente TimescaleDB. El navegador no accede a Postgres.
- El login usa usuarios persistidos en `dashboard_users`, con password hash `PBKDF2`.
- El admin inicial se define por `APP_ADMIN_USERNAME` y `APP_ADMIN_PASSWORD`.
- El panel web permite listar, crear y activar/desactivar usuarios si la sesion tiene rol `admin`.
