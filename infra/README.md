# Infrastructure

Этот compose-стек развёрнут под **Dokploy 0.29.2**, который из коробки предоставляет Traefik как reverse-proxy и Let's Encrypt для TLS. Мы НЕ запускаем собственный Caddy или nginx — Traefik читает labels на сервисах напрямую.

## Files

- `docker-compose.dev.yml` — overlay для локальной разработки: подменяет внешний `dokploy-network` на bridge, открывает порты наружу
- `postgres-roles.md` — описание Postgres-ролей и их grants
- `.env.staging.example`, `.env.production.example` — env-шаблоны для staging (nltosql.com) и production (artka.dev)

## Routing model

Каждый публично-доступный сервис в `docker-compose.yml` несёт собственные Traefik labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.<name>.rule=Host(`<domain>`)"
  - "traefik.http.routers.<name>.entrypoints=websecure"
  - "traefik.http.routers.<name>.tls.certResolver=letsencrypt"
  - "traefik.http.services.<name>.loadbalancer.server.port=<port>"
```

В одном compose настроены роутеры для обоих доменных семейств — `*.artka.dev` (prod) и `*.nltosql.com` (staging). Traefik отдаёт каждый Host правильному upstream. Один и тот же контейнер обслуживает оба DNS — какие из них реально активны, определяется тем, на чей IP указывает A-запись.

## Noindex on staging

Middleware `staging-noindex@docker` (определён в labels `api`) и `admin-noindex@docker` (на сервисе admin) добавляют header `X-Robots-Tag: noindex, nofollow, noarchive`.

- `api.nltosql.com` → middleware применяется → noindex
- `api.artka.dev` → middleware НЕ применяется → нормальный response
- `admin.*` → всегда noindex (админка не индексируется ни на одном из доменов)

Полная стратегия cutover: `../docs/cutover-checklist.md`. Spec: `../docs/superpowers/specs/2026-05-10-postgres-cms-agents-design.md` Section 13a.

## Local dev

```bash
# All services on bridge network with direct host ports
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d

# Verify
curl localhost:3001/health  # api
curl localhost:3002/health  # render
curl localhost:8000/health  # agents
curl localhost:8080/health  # admin (nginx)
```

## Staging deploy (nltosql.com via Dokploy)

В Dokploy создать compose-приложение из этой ветки, указать env-файл `infra/.env.staging.example` (заполнив секреты). Dokploy:

1. подключит все сервисы к `dokploy-network`;
2. Traefik подхватит labels и начнёт routing для `api.nltosql.com`, `admin.nltosql.com` (после Plan 2 — также `nltosql.com`);
3. TLS получит автоматически (Let's Encrypt через настроенный в Dokploy resolver `letsencrypt`).

DNS-записи `*.nltosql.com` должны указывать на IP Dokploy-хоста заранее.

## Production cutover (artka.dev)

См. `../docs/cutover-checklist.md` для пошаговой процедуры.

Кратко: тот же compose, env переключается на `infra/.env.production.example`, DNS A-записи `artka.dev`/`api.artka.dev`/`admin.artka.dev` переключаются на Dokploy-хост, Traefik выпустит TLS на новые домены автоматически.
