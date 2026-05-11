# Production cutover checklist (artka.dev)

См. spec Section 13a для полного описания стратегии.

## T-24h: prep
- [ ] DNS TTL для artka.dev, api.artka.dev, admin.artka.dev снижен до 60 сек
- [ ] `pg_dump` свежей prod БД сохранён в безопасное место
- [ ] Текущий sitemap.xml artka.dev сохранён в `_archive/sitemap-pre-cutover.xml`
- [ ] GSC Coverage report экспортирован (baseline для diff)
- [ ] Список published URLs из БД на staging спарcен с baseline sitemap

## T-1h: pre-cutover audit
- [ ] `pnpm tsx scripts/url-parity-check.ts` против https://nltosql.com — 0 failures
- [ ] Spot-check 10 рандомных постов в браузере на staging vs production
- [ ] Все Plan 1-6 done conditions зелёные
- [ ] `curl -I https://nltosql.com/` → есть `X-Robots-Tag: noindex, nofollow`

## T-0: cutover (≤30 мин)
- [ ] `pg_restore` свежий prod-dump на staging БД (или re-run `migrate-content-to-db` если markdown ещё актуален)
- [ ] **Rotate Postgres role passwords** (4 roles: app_writer, app_reader, render_reader, agent_writer): `ALTER ROLE <name> PASSWORD '<secure-random>';`. Default placeholder passwords from migration 0007 (`*_pw`) НЕ должны попасть в prod.
- [ ] Update `DATABASE_URL` in `infra/.env.production` for each service (api, render, agents, frontend) с rotated passwords
- [ ] Switch env на сервере с `infra/.env.staging` → `infra/.env.production` (см. infra/.env.production.example)
- [ ] `docker compose down && docker compose up -d` — Caddy перевыпустит TLS на artka.dev/api.artka.dev/admin.artka.dev
- [ ] DNS A/AAAA artka.dev, api.artka.dev, admin.artka.dev → IP cutover-сервера
- [ ] `curl -I https://artka.dev/` → НЕТ `X-Robots-Tag`, статус 200
- [ ] `curl https://artka.dev/robots.txt` → Allow + sitemap link
- [ ] `curl https://artka.dev/sitemap-index.xml` → N URLs, N == baseline

## T+30min: verify
- [ ] 10 постов открываются на artka.dev по существующим URL (no 404)
- [ ] RSS на /rss.xml — валидный XML с canonical URLs artka.dev
- [ ] OG metadata 3 random посты совпадают с baseline (canonical, og:url, og:image)
- [ ] /tags, /tags/<tag>, /projects, /about, /now, /uses — все 200

## T+1h: SEO submit
- [ ] GSC: re-fetch https://artka.dev/sitemap-index.xml
- [ ] GSC: Request indexing для homepage + top 3 posts
- [ ] Plausible/Analytics: traffic не упал

## T+24h-48h: monitor
- [ ] Caddy access logs: 4xx/5xx rate в норме
- [ ] GSC Coverage: новые URLs появляются в Indexed, нет всплеска "Not found (404)"
- [ ] Bounce rate в Plausible сравнимый с baseline
- [ ] Decision: nltosql.com → continue as staging (Variant A) ИЛИ 301 → artka.dev (Variant B)

## Rollback (если критично)
- [ ] DNS A/AAAA artka.dev вернуть на старый сервер (TTL 60 сек — swap минуты)
- [ ] Старый stack должен оставаться запущенным 24h после cutover как safety net
