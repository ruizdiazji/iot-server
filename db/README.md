# TimescaleDB + PostgreSQL

Esta carpeta contiene una pila mínima para levantar PostgreSQL con la extensión TimescaleDB, lista para almacenar datos de sensores (series temporales) y metadatos relacionales.

## Contenido

- `docker-compose.yml`: define el servicio `timescaledb` sobre la red externa `edge_net`.
- `.env.example`: variables de entorno recomendadas (usuario, contraseña, DB, puerto).
- `initdb/`: scripts SQL que se ejecutan en el primer arranque (actualmente habilita `timescaledb`).
- `data/`: volumen persistente con los datos de PostgreSQL.
- `Makefile`: comandos auxiliares (`make up`, `make psql`, etc.).

## Puesta en marcha

```bash
cd db
cp .env.example .env         # Ajusta credenciales y puertos si es necesario
make network                 # Crea la red edge_net si aún no existe
make up                      # Arranca TimescaleDB
```

La base queda accesible en `postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@<host>:<POSTGRES_PORT>/<POSTGRES_DB>`. Por defecto expone el puerto 5432 en el host.

## Uso básico

- Conectarte con `make psql` para abrir una sesión `psql` dentro del contenedor.
- Crear tablas de series temporales:

  ```sql
  CREATE TABLE sensors (
    device_id TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    payload JSONB,
    PRIMARY KEY (device_id, received_at)
  );
  SELECT create_hypertable('lecturas', 'received_at');
  ```

- Guardar metadatos en tablas normales (PostgreSQL estándar) y relacionarlos con las hypertables vía `JOIN`.

## Integración con el resto del stack

- Los servicios que estén en la red Docker `edge_net` pueden usar el hostname `edge-timescaledb` (o el valor de `TIMESCALEDB_CONTAINER_NAME`) para conectarse sin exponer el puerto al host.
- Para los contenedores de ingesta (p. ej., un consumidor MQTT) añade `depends_on: [timescaledb]` y las variables `DATABASE_URL` o similares en su `docker-compose.yml`.
- Ajusta valores de `POSTGRES_PASSWORD` y evita dejar credenciales por defecto antes de desplegar en producción.

## Mantenimiento

- `make logs`: ver la salida de PostgreSQL.
- `make restart`: reiniciar el contenedor tras cambiar configuración.
- Backups: puedes usar `docker compose exec timescaledb pg_dump ...` o montar un script en `db/scripts/` y agendar un cron en el host.

Con esta base tenés un datastore listo para telemetría y metadatos, integrable con tus pipelines MQTT o REST.
