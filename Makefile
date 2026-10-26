ENV_FILE := $(if $(wildcard router/.env),--env-file router/.env)
COMPOSE := docker compose $(ENV_FILE)
DEV_COMPOSE := docker compose $(ENV_FILE) -f docker-compose.dev.yml
PREBUILT_COMPOSE := docker compose $(ENV_FILE) -f docker-compose.yml -f docker-compose.prebuilt.yml

.DEFAULT_GOAL := help
.PHONY: help build up up-prebuilt down restart logs ps sh db-shell migrate migrate-revert backup restore deploy \
	dev dev-db dev-down dev-logs dev-ps dev-sh dev-db-shell dev-migrate

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the router and web images
	$(COMPOSE) build

up: ## Start db, router and web (Caddy) in the background
	$(COMPOSE) up -d --remove-orphans

up-prebuilt: ## Pull the CI-built router and web images from GHCR and start (no build on the server)
	$(PREBUILT_COMPOSE) up -d --remove-orphans

down: ## Stop and remove containers (volumes kept)
	$(COMPOSE) down

restart: ## Restart the router
	$(COMPOSE) restart router

logs: ## Tail logs for all services
	$(COMPOSE) logs -f --tail=100

ps: ## Show service status
	$(COMPOSE) ps

sh: ## Open a shell in the router container
	$(COMPOSE) exec router sh

db-shell: ## Open psql in the database
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

migrate: ## Run database migrations
	$(COMPOSE) exec router yarn run migration:prod:run

migrate-revert: ## Undo the last migration
	$(COMPOSE) exec router yarn run migration:prod:revert

backup: ## Dump the database to backups/mcp-<timestamp>.sql.gz
	@mkdir -p backups
	@name=backups/mcp-$$(date +%Y%m%d-%H%M%S).sql; \
	$(COMPOSE) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists' > $$name \
	  && gzip $$name && echo "Wrote $$name.gz" \
	  || { rm -f $$name; echo "Backup failed" >&2; exit 1; }

restore: ## Restore FILE=backups/<file>.sql.gz (replaces current data)
	@test -n "$(FILE)" || { echo "Usage: make restore FILE=backups/<file>.sql.gz" >&2; exit 1; }
	@test -f "$(FILE)" || { echo "No such file: $(FILE)" >&2; exit 1; }
	@printf "This replaces ALL data in the database with $(FILE). Type 'restore' to continue: "; \
	read answer; test "$$answer" = "restore" || { echo "Aborted."; exit 1; }
	$(COMPOSE) stop router
	gunzip -c "$(FILE)" | $(COMPOSE) exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'
	$(COMPOSE) start router

deploy: ## On the server: pull, rebuild and restart
	git pull --ff-only && $(COMPOSE) up -d --build --remove-orphans

dev: ## Start the dev stack: db, router (watch) and web (Vite) on localhost:5173
	$(DEV_COMPOSE) up -d --build --renew-anon-volumes

dev-db: ## Start only the dev Postgres on localhost:5432
	$(DEV_COMPOSE) up -d db

dev-down: ## Stop the dev stack
	$(DEV_COMPOSE) down

dev-logs: ## Tail dev logs
	$(DEV_COMPOSE) logs -f --tail=100

dev-ps: ## Show dev service status
	$(DEV_COMPOSE) ps

dev-sh: ## Open a shell in the dev router container
	$(DEV_COMPOSE) exec router sh

dev-db-shell: ## Open psql in the dev database
	$(DEV_COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

dev-migrate: ## Run migrations against the dev database
	$(DEV_COMPOSE) exec router yarn run migration:run
