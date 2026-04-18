# Broker MQTT Mosquitto

Esta carpeta contiene una instancia de Mosquitto lista para producción, con autenticación obligatoria, persistencia y configurada para integrarse con el proxy TLS basado en Nginx.

## Características

- Autenticación obligatoria mediante `password_file` y ACL.
- Configuración separada y versionada (`config/`) montada en modo solo lectura.
- Persistencia en disco (`data/persistence`) y logs rotables (`data/log`).
- Listener MQTT tradicional (1883) y websockets (9001) para clientes modernos.
- Makefile con tareas para credenciales, despliegue y chequeos de salud.
- Compartición de red Docker (`EDGE_NETWORK`) con el proxy para exponer el servicio de forma segura a Internet.

## Requisitos previos

- Docker Engine + Compose Plugin.
- La red externa definida en el proxy (`edge_net` por defecto). Creala una sola vez:

  ```bash
  make network
  ```

- Variables de entorno definidas en `.env` (copiar desde `.env.example`).

## Preparación

1. Copia y edita el archivo `.env`:

   ```bash
   cp .env.example .env
   nano .env
   ```

   Define el usuario y contraseña base (`MOSQUITTO_USERNAME`, `MOSQUITTO_PASSWORD`), puertos, límites de memoria y el nombre de la red compartida.

2. Genera el archivo de contraseñas (se almacenará como `secrets/passwordfile`):

   ```bash
   make passwd
   ```

   - Utiliza `make passwd-append` para agregar usuarios adicionales sin sobrescribir los existentes.
   - Edita `config/acl` para asignar permisos precisos por usuario y tópico.

## Despliegue

```bash
make prepare   # crea los directorios persistentes si no existen
make up        # levanta el contenedor
```

- Revisa el estado y los logs con:

  ```bash
  make status
  make logs
  ```

- Para detenerlo:

  ```bash
  make down
  ```

## Chequeo de salud manual

Comprueba que el broker responda a un tópico de sistema:

```bash
make health
```

## Integración con Nginx

- Usa el mismo `EDGE_NETWORK` que el proxy.
- Ajusta `MQTT_UPSTREAM_HOST` en `.env` del proxy con el valor de `MOSQUITTO_CONTAINER_NAME` o el nombre de servicio (`mosquitto`).
- Mantén el listener 1883 interno; Nginx se encargará de exponer TLS en el puerto 8883 (o el que definas).
- Opcional: deshabilita el listener websockets si no lo necesitas (`listener 9001` en `config/mosquitto.conf`).

## Personalización sugerida

- Añade archivos dentro de `config/conf.d/` para configurar bridges, filtros adicionales, o listeners específicos.
- Configura copias de seguridad regulares de `data/` y `secrets/`.
- Considera mover el archivo de contraseñas a un almacenamiento seguro (por ejemplo, Docker secrets nativos o un gestor externo) para un entorno más grande.

## Estructura

```
mqtt/
├── config/
│   ├── acl
│   ├── conf.d/
│   │   └── .gitkeep
│   └── mosquitto.conf
├── data/
│   ├── log/
│   └── persistence/
├── secrets/
│   └── passwordfile.example
├── docker-compose.yml
├── Makefile
└── .env.example
```

Adapta la configuración según las exigencias de tu solución IoT (QoS, retención, bridges, etc.).
