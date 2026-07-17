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

El archivo raiz `.env` del dashboard ya esta alineado con el stack `db/`.
Ajustar segun tu entorno:

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `APP_ADMIN_USERNAME`, `APP_ADMIN_PASSWORD`
- `APP_SECRET_KEY`
- `EDGE_NETWORK`

## Esquema de datos esperado

El backend ya viene configurado para consultar la tabla real del ingestor:

- `sensor_events`
- columna temporal: `recorded_at`
- columna de topic: `topic`
- columna numerica: `value_double`

Tambien usa una tabla propia para autenticacion:

- `dashboard_users`

El archivo [db/initdb/03_create_dashboard_users.sql](/home/juanird/Documentos/ESP32/ESP_IDF_PROJECTS/dashboard_mqtt_web/db/initdb/03_create_dashboard_users.sql:1) la crea en instalaciones nuevas.
Para bases ya existentes, el backend tambien la crea automaticamente al arrancar y genera el admin inicial si no existe.

## Modelo Sparkplug-like

El dashboard normaliza los mensajes MQTT a un modelo compatible con una migracion futura a Sparkplug B:

- `group_id`: agrupacion logica, por defecto `central_controller`.
- `edge_node_id`: nodo de borde, por defecto `esp32-central-01`.
- `device_id`: device logico estable, por ejemplo `environment` o `control`.
- `metric_name`: variable estable, por ejemplo `temperature_c`, `humidity_pct`, `co2_ppm`, `light_lux`.
- `source_model` y `source_channel`: sensor fisico que produjo el dato, por ejemplo `thmb02s` y `addr:1`.

El firmware actual puede seguir publicando JSON en topics existentes. El ingestor traduce:

- `central_controller/sensors/thmb02s` a `environment.temperature_c` y `environment.humidity_pct`.
- `central_controller/sensors/tsl2591` a `environment.light_lux`.
- `central_controller/sensors/mhz19b` a `environment.co2_ppm`.
- `central_controller/sensors/hlw8032` a `energy.power_w`, `energy.voltage_v`, `energy.current_a`, `energy.energy_wh`, `energy.power_factor`.
- `central_controller/sensors/status` a `control.*`.

Esto permite cambiar un sensor fisico sin romper historicos ni pantallas. Por ejemplo, si `thmb02s` se reemplaza por `dht22`, la serie sigue siendo `environment.temperature_c`; solo cambia `source_model`.

Las tablas nuevas son:

- `controller_devices`: nodos/devices logicos y topic de comando.
- `metric_readings`: series normalizadas por metrica.
- `controller_status`: snapshots del estado del control loop.
- `controller_config_current`: ultima configuracion conocida o enviada.
- `controller_config_revisions`: auditoria de cambios enviados desde el dashboard.
- `controller_schedule_points`: estructura futura para calendarios normalizados.

Para Sparkplug nativo futuro, el namespace esperado seria:

```text
spBv1.0/{group_id}/DBIRTH/{edge_node_id}/environment
spBv1.0/{group_id}/DDATA/{edge_node_id}/environment
spBv1.0/{group_id}/DBIRTH/{edge_node_id}/control
spBv1.0/{group_id}/DDATA/{edge_node_id}/control
spBv1.0/{group_id}/DCMD/{edge_node_id}/control
```

Por ahora el payload sigue siendo JSON. El backend publica cambios de configuracion en el topic de comando detectado, o en `DEFAULT_COMMAND_TOPIC`.

## Red compartida

Los tres stacks usan la red Docker externa `edge_net`.
Si todavia no existe, crearla una sola vez:

```bash
docker network create edge_net
```

Despues podes levantar cada stack por separado y todos quedan en la misma red:

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
- `GET /api/devices`
- `GET /api/devices/{group_id}/{edge_node_id}/overview`
- `GET /api/devices/{group_id}/{edge_node_id}/metrics`
- `GET /api/metrics/timeseries?group_id=...&edge_node_id=...&device_id=environment&metric_name=temperature_c&from=...&to=...`
- `GET /api/devices/{group_id}/{edge_node_id}/config/current`
- `GET /api/devices/{group_id}/{edge_node_id}/config/history`
- `PATCH /api/devices/{group_id}/{edge_node_id}/config`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/{username}`

## Notas de integracion

- El backend consulta directamente TimescaleDB. El navegador no accede a Postgres.
- El login ahora usa usuarios persistidos en `dashboard_users`, con password hash `PBKDF2`.
- El admin inicial se define por `APP_ADMIN_USERNAME` y `APP_ADMIN_PASSWORD`.
- El panel web permite listar, crear y activar/desactivar usuarios si la sesion tiene rol `admin`.
