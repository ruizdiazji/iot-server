ENV_FILE ?= .env

ifneq ($(wildcard $(ENV_FILE)),)
include $(ENV_FILE)
export $(shell sed -n 's/^\([A-Za-z0-9_]*\)=.*/\1/p' $(ENV_FILE))
endif

PROJECT_NAME ?= mqtt_stack
EDGE_NETWORK ?= edge_net
COMPOSE = docker compose --env-file $(ENV_FILE) --project-name $(PROJECT_NAME) -f docker-compose.yml
PASSWORD_FILE = secrets/passwordfile

.PHONY: help config-check secrets-check prepare network build up down restart logs status shell passwd passwd-append health

help:
	@echo "Available targets:"
	@echo "  make network         # Crea la red Docker compartida"
	@echo "  make prepare         # Crea directorios y ajusta permisos (SUDO)"
	@echo "  make up              # Arranca el broker Mosquitto"
	@echo "  make down            # Detiene el stack"
	@echo "  make passwd          # Crea el archivo de contraseñas (SUDO)"
	@echo "  make health          # Chequeo de salud manual"

config-check:
	@test -f $(ENV_FILE) || (echo "Falta $(ENV_FILE). Copia .env.example y personaliza variables." && exit 1)

secrets-check:
	@test -f $(PASSWORD_FILE) || (echo "Falta $(PASSWORD_FILE). Ejecuta 'make passwd' primero." && exit 1)


network:
	@docker network create $(EDGE_NETWORK) >/dev/null 2>&1 || true

build: config-check
	@$(COMPOSE) build

up: config-check secrets-check prepare
	@$(COMPOSE) up -d

down:
	@$(COMPOSE) down

restart:
	@$(COMPOSE) restart mosquitto

logs:
	@$(COMPOSE) logs -f mosquitto

status:
	@$(COMPOSE) ps

shell:
	@$(COMPOSE) exec mosquitto sh

prepare:
	@mkdir -p data/persistence data/log secrets config/conf.d
	@echo "Ajustando permisos de carpetas de datos..."
	@sudo chown -R $(shell id -u):$(shell id -g) data secrets
	@sudo chmod 700 data/persistence
	@sudo chmod 700 data/log
	@sudo touch data/log/mosquitto.log
	@sudo chown $(shell id -u):$(shell id -g) data/log/mosquitto.log
	@sudo chmod 600 data/log/mosquitto.log

passwd: config-check prepare
	@test -n "$(MOSQUITTO_USERNAME)" || (echo "Define MOSQUITTO_USERNAME" && exit 1)
	@test -n "$(MOSQUITTO_PASSWORD)" || (echo "Define MOSQUITTO_PASSWORD" && exit 1)
	@echo "Generando nuevo archivo de contraseñas..."
	@$(COMPOSE) run --rm --user $(shell id -u):$(shell id -g) mosquitto \
		mosquitto_passwd -b -c /mosquitto/secrets/passwordfile "$(MOSQUITTO_USERNAME)" "$(MOSQUITTO_PASSWORD)"
	@sudo chown $(shell id -u):$(shell id -g) $(PASSWORD_FILE)
	@sudo chmod 600 $(PASSWORD_FILE)

passwd-append: config-check prepare
	@test -n "$(MOSQUITTO_USERNAME)" || (echo "Define MOSQUITTO_USERNAME" && exit 1)
	@test -n "$(MOSQUITTO_PASSWORD)" || (echo "Define MOSQUITTO_PASSWORD" && exit 1)
	@$(COMPOSE) run --rm --user $(shell id -u):$(shell id -g) mosquitto \
		mosquitto_passwd -b /mosquitto/secrets/passwordfile "$(MOSQUITTO_USERNAME)" "$(MOSQUITTO_PASSWORD)"
	@sudo chown $(shell id -u):$(shell id -g) $(PASSWORD_FILE)
	@sudo chmod 600 $(PASSWORD_FILE)

health: config-check
	@$(COMPOSE) exec mosquitto mosquitto_sub -h localhost -p 1883 -u "$(MOSQUITTO_USERNAME)" -P "$(MOSQUITTO_PASSWORD)" -t '$$SYS/broker/uptime' -C 1 -W 15