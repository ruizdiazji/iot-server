ENV_FILE ?= .env

ifneq ($(wildcard $(ENV_FILE)),)
include $(ENV_FILE)
export $(shell sed -n 's/^\([A-Za-z0-9_]*\)=.*/\1/p' $(ENV_FILE))
endif

PROJECT_NAME ?= db_stack
EDGE_NETWORK ?= edge_net
COMPOSE = docker compose --env-file $(ENV_FILE) --project-name $(PROJECT_NAME) -f docker-compose.yml
SERVICE = timescaledb

.PHONY: help network prepare build up down restart logs status shell psql backup restore

help:
	@echo "Targets disponibles:"
	@echo "  make network        # Crea la red externa compartida (edge_net)"
	@echo "  make prepare        # Crea los directorios persistentes"
	@echo "  make up             # Arranca TimescaleDB en segundo plano"
	@echo "  make down           # Detiene y elimina el contenedor"
	@echo "  make restart        # Reinicia el servicio"
	@echo "  make logs           # Sigue los logs de PostgreSQL"
	@echo "  make status         # Muestra el estado del stack"
	@echo "  make shell          # Abre una shell dentro del contenedor"
	@echo "  make psql           # Ejecuta psql dentro del contenedor"

prepare:
	@mkdir -p data
	@chmod 700 data

network:
	@docker network create $(EDGE_NETWORK) >/dev/null 2>&1 || true

build:
	@$(COMPOSE) pull

up: prepare network
	@$(COMPOSE) up -d

down:
	@$(COMPOSE) down

restart:
	@$(COMPOSE) restart $(SERVICE)

logs:
	@$(COMPOSE) logs -f $(SERVICE)

status:
	@$(COMPOSE) ps

shell:
	@$(COMPOSE) exec $(SERVICE) bash

psql:
	@$(COMPOSE) exec $(SERVICE) psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}
