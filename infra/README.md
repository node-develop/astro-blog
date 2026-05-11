# Infrastructure

## Files

- `Caddyfile` — reverse proxy for prod (api.artka.dev, admin.artka.dev) + staging (nltosql.com subdomains with hard noindex)
- `docker-compose.dev.yml` — overlay для локальной разработки (отключает Caddy, открывает порты наружу)
- `postgres-roles.md` — описание ролей Postgres и их grants
- `.env.staging.example`, `.env.production.example` — env-template для staging (nltosql.com) и продакшна (artka.dev)

## Local dev

```bash
# All services with direct ports (no Caddy)
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d

# Verify
curl localhost:3001/health  # api
curl localhost:3002/health  # render
curl localhost:8000/health  # agents
curl localhost:8080/health  # admin (nginx)
```

## Staging deploy (nltosql.com)

```bash
# On staging server
cp infra/.env.staging.example .env
# fill secrets, then:
docker compose up -d
```

Каждая страница на nltosql.com отдаёт `X-Robots-Tag: noindex, nofollow, noarchive`, `/robots.txt` возвращает `Disallow: /`.

## Production cutover (artka.dev)

См. `../docs/cutover-checklist.md`.

После cutover на сервере:

```bash
cp infra/.env.production.example .env  # затем заполнить секреты
docker compose down && docker compose up -d
# Caddy получит TLS на artka.dev/api.artka.dev/admin.artka.dev
```
