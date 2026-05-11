# Postgres-as-CMS + Python Agent Service: Design

**Date:** 2026-05-10
**Author:** A. Kashuta (with Claude)
**Status:** Draft for review (v2 — после architect+critic ревью)
**Branch:** `refactor/postgres-cms-agents`

## 1. Problem & motivation

Текущий стек (Astro 5 SSG из markdown-файлов в git, мутации через Astro Actions, LLM-пайплайны на TypeScript-Anthropic SDK) упирается в две конкретные боли:

1. **Git-as-CMS медленный.** Публикация = `commit → push → GH Actions → docker build → Dokploy → live`, ~5 минут. Для одного автора это терпимо, для агентов, публикующих пачкой — нет.
2. **LLM-агенты внутри Astro процесса не наблюдаемы.** Translate и social pipeline на Anthropic SDK работают, но при сбое (а они растут в сложности) трассировки шагов нет. Хочу строить агентов на LangGraph + LangChain + LangSmith — это **Python-first** экосистема.
3. **Админка ограничена для extension.** Astro Actions нормально для CRUD, но плохо для realtime job status, custom widgets (json-viewers, prompt editors), bulk-операций, dashboard'ов.

Боли, которые **уже не существуют**: Postgres устраивает; рендеринг Mermaid/KaTeX/MDX работает; Better-Auth работает; деплой через Docker+ghcr+Dokploy работает.

## 2. Goals & non-goals

### Goals
- Posts, pages, projects живут в Postgres. Публикация = `INSERT/UPDATE` + revalidate, без ребилда.
- Astro = read-only публичный фронт, SSR из БД, тот же Mermaid/KaTeX/MDX.
- Agent service на Python (FastAPI + LangGraph + LangSmith + asyncpg), worker pulls из `agent_jobs` через `FOR UPDATE SKIP LOCKED`. Cron через APScheduler в том же процессе.
- Admin = отдельная React SPA на `admin.artka.dev` (Vite + TanStack Router/Query + shadcn/ui), realtime job board через SSE.
- Hono API на `api.artka.dev` — единственный публичный backend, Better-Auth, render-pipeline.

### Non-goals
- Multi-tenant / collaborative editing.
- CDN/edge deployment (всё в одном Docker compose).
- Полная замена Anthropic SDK на LangChain в TS-коде. Старый `lib/social/` и `scripts/translate.ts` мигрируются **после** того, как новые агенты доказывают архитектуру.
- Постепенный sync markdown ↔ DB. После миграции — БД единственный source.

## 3. Architecture overview

```
                            ┌──────────────────────────────────────────┐
                            │         Postgres 18 (schemas: public,     │
                            │           langgraph)                       │
                            │ Better-Auth, posts, post_revisions,       │
                            │ media_assets, social_posts, agent_jobs,   │
                            │ agent_runs, agent_artifacts;              │
                            │ langgraph.* — checkpoints                 │
                            └──┬─────────┬─────────┬─────────────┬──────┘
       ┌───────────────────────┘         │         │             │
       │  Drizzle (TS, RO)               │ RW      │ RO          │ asyncpg
       │  role: public_reader            │ admin   │ render      │ role: agent
       ▼                                 ▼         ▼             ▼
┌──────────────────┐  HTTP  ┌────────────────────┐ ┌─────────┐ ┌─────────────┐
│ Astro 5 frontend │ ◀──────│  Hono API          │ │ render- │ │ Python svc  │
│ artka.dev        │        │  api.artka.dev:3001│ │ service │ │ worker+sched│
│ SSR (no build)   │        │  Better-Auth, CRUD,│ │ :3002   │ │ +  /health  │
│ body_html из БД  │        │  SSE, Zod payload  │ │ unified │ │ :8000       │
│ (last-good cache)│        │  validation per    │ │ +rehype │ │ internal    │
│                  │        │  kind              │ │ +Playwr.│ │             │
└──────────────────┘        └──┬─────────────────┘ └────▲────┘ └──────▲──────┘
                               │ SSE + REST              │ HTTP        │ LISTEN
                               │ cookie .artka.dev       │ /render     │ NOTIFY
                               │ SameSite=None;Secure    │             │
                               ▼                                       │
                    ┌──────────────────────────┐                       │
                    │  React Admin SPA         │                       │
                    │  admin.artka.dev (Vite,  │                       │
                    │  static, nginx)          │                       │
                    └──────────────────────────┘                       │
                                                                       │
                  Postgres trigger ──── pg_notify('agent_event') ──────┘
```

**Принципы:**
- Astro никогда не пишет в БД. Чтение через Hono API. **При недоступности Hono — отдаёт last-known body_html из локального файлового кэша** (по запросу — fetch свежий, но stale тоже ок).
- Hono — единственный публичный backend (api.artka.dev), Better-Auth здесь. Не содержит Playwright.
- **`render-service`** — отдельный stateless контейнер с Node + unified/rehype/Playwright. Hono вызывает `POST http://render:3002/render` для preview и при publish. Crash render-service не валит auth/SSE.
- Python service не имеет публичного API. Триггер агента = `INSERT INTO agent_jobs`. Worker подхватывает через `LISTEN agent_jobs_pending` + polling fallback.
- Cookie `Domain=.artka.dev; SameSite=None; Secure` шарится между admin и api.
- Postgres хранит LangGraph checkpoints в **отдельной schema `langgraph`** (`LANGGRAPH_PG_SCHEMA=langgraph`). Бэкап доменных данных не тащит мегабайты state.
- **Postgres roles** разделены: `app_reader` (Astro), `app_writer` (Hono), `agent_writer` (Python — grants только на `agent_*`, `posts` write, `media_assets` read). Compromise одного сервиса не открывает `sessions`/`accounts`.

## 4. Data model

### New table `posts` (universal: post | page | project)

```sql
CREATE TABLE posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  lang            text NOT NULL CHECK (lang IN ('ru','en')),
  kind            text NOT NULL CHECK (kind IN ('post','page','project')) DEFAULT 'post',
  status          text NOT NULL CHECK (status IN ('draft','published','unlisted','archived')) DEFAULT 'draft',
  -- 'unlisted' = публикация по прямой ссылке, не в листингах (заменяет старый hidden_from_list)
  -- 'archived' = снято с публикации, недоступно публично

  -- frontmatter
  title           text NOT NULL,
  description     text NOT NULL,
  summary         text,
  keywords        text[] NOT NULL DEFAULT '{}',
  faq             jsonb,
  tags            text[] NOT NULL DEFAULT '{}',
  cover           text,
  cover_alt       text,
  author          text NOT NULL DEFAULT 'Артём',
  pub_date        timestamptz NOT NULL,
  updated_date    timestamptz,
  extra           jsonb NOT NULL DEFAULT '{}',  -- kind-specific (project: stack/outcomes/links)

  -- body
  body_md         text NOT NULL,
  body_html       text,                          -- rendered с инлайн mermaid SVG
  toc             jsonb,                         -- [{slug, depth, text}]
  render_version  int NOT NULL DEFAULT 0,
  rendered_at     timestamptz,

  -- bilingual sync
  source_hash     text,
  manually_edited boolean NOT NULL DEFAULT false,

  -- list controls (бывшая postsMeta)
  display_order   int NOT NULL DEFAULT 0,
  pinned          boolean NOT NULL DEFAULT false,
  -- hidden_from_list — не нужен: используем status='unlisted' вместо

  -- search
  search_vector   tsvector,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (slug, lang)
);

CREATE INDEX posts_published_idx ON posts (lang, pub_date DESC) WHERE status='published';
CREATE INDEX posts_search_idx ON posts USING gin (search_vector);
CREATE INDEX posts_tags_idx ON posts USING gin (tags);
CREATE INDEX posts_kind_status_idx ON posts (kind, status, lang);
```

**Триггер** обновляет `search_vector` из (title, description, summary, body_md, tags) на UPDATE/INSERT.

### `post_revisions` — ALTER существующей `postRevisions`

```sql
ALTER TABLE post_revisions
  ADD COLUMN post_id uuid REFERENCES posts(id) ON DELETE CASCADE;

-- backfill: UPDATE post_revisions SET post_id = (SELECT id FROM posts WHERE posts.slug = post_revisions.slug AND posts.lang = 'ru');
-- затем DROP COLUMN slug, переписать триггер prune до 50 на post_id

CREATE INDEX post_revisions_post_idx ON post_revisions (post_id, created_at DESC);
```

### `agent_jobs` — единая очередь

```sql
CREATE TABLE agent_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed','cancelled')),
  priority        int NOT NULL DEFAULT 0,
  run_after       timestamptz NOT NULL DEFAULT now(),
  attempts        int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 3,
  last_error      text,
  idempotency_key text,                           -- dedupe: одинаковые ключи в pending → один job
  created_by_id   uuid REFERENCES users(id) ON DELETE RESTRICT, -- audit trail: кто запустил $$$
  claimed_at      timestamptz,
  claimed_by      text,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, idempotency_key)
);

CREATE INDEX agent_jobs_pending_idx
  ON agent_jobs (priority DESC, run_after, created_at)
  WHERE status='pending';
CREATE INDEX agent_jobs_kind_idx ON agent_jobs (kind, created_at DESC);
```

Триггеры:
- `AFTER INSERT/UPDATE` → `pg_notify('agent_jobs_pending', json_build_object('id',NEW.id,'kind',NEW.kind))::text)` если status='pending'
- `AFTER UPDATE` → `pg_notify('agent_event', json_build_object('type','job.updated','id',NEW.id,'status',NEW.status))::text)`

### `agent_runs` — execution traces

```sql
CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  attempt         int NOT NULL,
  langgraph_thread_id  text,
  langsmith_trace_id   text,
  status          text NOT NULL CHECK (status IN ('running','completed','failed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  model_calls     int NOT NULL DEFAULT 0,
  input_tokens    int NOT NULL DEFAULT 0,
  output_tokens   int NOT NULL DEFAULT 0,
  cost_usd        numeric(10,4) NOT NULL DEFAULT 0,
  error           jsonb,
  final_output    jsonb,
  UNIQUE (job_id, attempt)
);

CREATE INDEX agent_runs_trace_idx ON agent_runs (langsmith_trace_id);
```

### `agent_artifacts` — outputs

```sql
CREATE TABLE agent_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind            text NOT NULL,           -- 'draft_post' | 'translation' | 'social_draft' | 'critic_note' | 'rss_seed' | ...
  ref_table       text,
  ref_id          text,
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_artifacts_kind_idx ON agent_artifacts (kind, created_at DESC);
CREATE INDEX agent_artifacts_ref_idx  ON agent_artifacts (ref_table, ref_id);
```

### Existing tables

| Таблица | Что делаем |
|---|---|
| `users`, `sessions`, `accounts`, `verifications` | Без изменений (Better-Auth). |
| `postsMeta` | DROP после миграции. Поля → `posts.display_order/pinned/hidden_from_list`. |
| `postRevisions` | ALTER → `post_revisions` + FK `post_id`, триггер prune переписать. |
| `mediaAssets` | Без изменений. |
| `socialPosts` | ADD `post_id uuid REFERENCES posts(id) NOT NULL`. Backfill в одной миграции, `(post_collection, post_slug)` DROP — pick one rule. |
| `courseProgress` | Без изменений. |

### Migration data path

`scripts/migrate-content-to-db.ts`:
1. Читает все `src/content/posts/**/*.md`, `src/content/site/*.md`, `src/content/projects/*.md` через текущую Astro content layer.
2. Для каждого файла: парсит frontmatter (Zod, существующая схема) + body, INSERT в `posts` (kind=post|page|project).
3. EN twin → отдельная row с тем же slug, другим lang.
4. Idempotent (UPSERT по `(slug, lang)`).

После — `scripts/render-all-posts.ts` для каждого: rehype + Playwright → `body_html`.

После проверки паритета — `mv src/content/posts/ _archive/`.

## 5. API contracts

### Conventions
- Prefix `/api/v1/`
- Success: `{ data: T }`, Error: `{ error: { code, message, details? } }`
- Validation: Zod в `packages/shared/`, общие для Hono и admin SPA
- Auth cookie: `Domain=.artka.dev; Secure; SameSite=None; HttpOnly`. **`SameSite=None` обязательно** — admin.artka.dev → api.artka.dev это cross-site fetch, Lax cookie не отправится. `Secure` обязателен парно с `None`.
- CORS: Hono allows точные origins `https://admin.artka.dev` (prod) + `http://localhost:5173` (dev) c `credentials: true`. Никаких wildcard.

### Public (Astro SSR consumer)

| Method | Path | Описание |
|---|---|---|
| GET | `/api/v1/public/posts` | List published, filters: `lang`, `kind`, `tag`, `limit`, `offset` |
| GET | `/api/v1/public/posts/:slug?lang=ru` | Single post с body_html и toc |
| GET | `/api/v1/public/pages/:slug?lang=ru` | kind=page (home, about, now, uses) |
| GET | `/api/v1/public/projects?lang=ru` | kind=project, отсортированы по featured/order |
| GET | `/api/v1/public/tags?lang=ru` | `[{tag, count}]` |
| GET | `/api/v1/public/search?q=...&lang=ru` | Postgres FTS на search_vector |

Public endpoints возвращают `Cache-Control: public, max-age=60, stale-while-revalidate=300` + ETag из `posts.updated_at`.

### Auth (Better-Auth handler)
- `/api/auth/*` — стандартный handler

### Admin (cookie auth, role ∈ admin|editor)

**Posts/pages/projects (универсально через `?kind=`):**
- `GET /api/v1/admin/posts`
- `GET /api/v1/admin/posts/:id`
- `POST /api/v1/admin/posts`
- `PATCH /api/v1/admin/posts/:id`
- `POST /api/v1/admin/posts/:id/publish`
- `POST /api/v1/admin/posts/:id/unpublish`
- `POST /api/v1/admin/posts/:id/archive`
- `POST /api/v1/admin/posts/:id/render`
- `GET /api/v1/admin/posts/:id/revisions`
- `POST /api/v1/admin/posts/:id/revisions/:revId/restore`

**Render preview (без записи):**
- `POST /api/v1/admin/render/preview` — `{body_md, lang}` → `{body_html, toc, mermaid_svgs}`

**Public extras:**
- `GET /api/v1/public/posts/:slug/langs?kind=post` — `{ru?: {slug, status}, en?: {slug, status}}` для language switcher в Astro

**Media:**
- `GET /api/v1/admin/media`
- `POST /api/v1/admin/media/upload` (multipart)
- `DELETE /api/v1/admin/media/:id`

**Jobs (agent board) — единственная точка триггера агента:**
- `GET /api/v1/admin/jobs` — list, фильтры
- `GET /api/v1/admin/jobs/:id` — full с runs+artifacts
- `POST /api/v1/admin/jobs` — `{kind, payload, priority?, run_after?, idempotency_key?}`. **Hono валидирует kind по allowlist + Zod-схему payload per kind** (см. `packages/shared/src/agents/payloads.ts`). Неизвестный kind → 400. Невалидный payload → 400 с details. Это страхует от admin-юзера, отправляющего произвольный kind/payload в worker.
- `POST /api/v1/admin/jobs/:id/cancel`
- `POST /api/v1/admin/jobs/:id/retry`
- `GET /api/v1/admin/jobs/stream` — **SSE**: events `job.created`, `job.updated`, `run.started`, `run.tokens`, `run.finished`. Поддерживает `Last-Event-ID` header (стандарт SSE): на reconnect Hono отдаёт missed events из БД (`SELECT ... WHERE id > last_event_id ORDER BY id`). Каждое событие имеет `id:` строку = monotonic event_id из таблицы `agent_events` (создаётся триггером pg_notify). Это снимает «потеря событий при разрыве соединения».

### Internal API (Hono ↔ Python)

**Нет.** Сознательное решение.
- Hono триггерит агента через `INSERT INTO agent_jobs` (триггер pg_notify будит worker).
- Python пишет результаты в `agent_runs`, `agent_artifacts` через asyncpg + триггер pg_notify будит SSE на Hono.
- Python `:8000/health` доступен только в docker network.

### Error model

```typescript
type ApiError = {
  error: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN'
        | 'CONFLICT' | 'RATE_LIMIT' | 'INTERNAL';
    message: string;
    details?: unknown;
  }
}
```

## 6. Agent service (Python)

### Каталог

```
agents/
├── pyproject.toml          # uv для зависимостей
├── Dockerfile
├── src/agents/
│   ├── main.py             # asyncio.gather(worker_loop, scheduler_loop, health_server)
│   ├── config.py           # Pydantic Settings
│   ├── db.py               # asyncpg pool + LISTEN
│   ├── worker/
│   │   ├── claim.py
│   │   ├── runner.py
│   │   └── retry.py
│   ├── scheduler.py        # APScheduler
│   ├── graphs/
│   │   ├── _registry.py    # kind → graph factory
│   │   ├── draft_from_url.py
│   │   ├── rss_monitor.py
│   │   ├── daily_digest.py
│   │   ├── translate.py    # port позже
│   │   └── social_drafts.py # port позже
│   ├── tools/
│   │   ├── fetch_url.py
│   │   ├── post_db.py
│   │   ├── llm.py
│   │   └── critic.py
│   └── health.py
└── tests/
```

### Worker loop

Python один процесс с `asyncio.gather(worker_loop, scheduler_loop, reaper_loop, health_server)`. **`reaper_loop`** — каждые 60 сек ищет stale claims (`status='running' AND claimed_at < now() - interval '10 minutes'`), помечает их `failed` или возвращает в `pending` если `attempts < max_attempts`. Без reaper процесс падает = job висит в `running` навсегда.

```python
async def worker_loop(pool):
    notify_event = asyncio.Event()
    async with pool.acquire() as listen_conn:
        await listen_conn.add_listener('agent_jobs_pending',
            lambda *_: notify_event.set())
        while True:
            job = await claim_next_job(pool)
            if not job:
                try: await asyncio.wait_for(notify_event.wait(), timeout=10.0)
                except asyncio.TimeoutError: pass
                notify_event.clear()
                continue
            await run_job(pool, job)
```

Claim:
```sql
UPDATE agent_jobs
SET status='running', claimed_at=now(), claimed_by=$1, attempts=attempts+1
WHERE id = (
  SELECT id FROM agent_jobs
  WHERE status='pending' AND run_after <= now()
  ORDER BY priority DESC, run_after, created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

Run:
- create `agent_runs` row
- `with langsmith_trace(...)`: `await graph.ainvoke(state, config={'configurable': {'thread_id': str(run_id)}})`
- write `agent_artifacts` rows
- mark run completed / job completed
- on error: mark run failed, reschedule with exponential backoff if attempts < max

### LangGraph

Каждый kind = `StateGraph` в `agents/graphs/<kind>.py` с TypedDict state. Чекпойнты в Postgres через `langgraph-checkpoint-postgres` в **отдельной schema `langgraph`** (`LANGGRAPH_PG_SCHEMA=langgraph` env var). Бэкап `pg_dump --schema=public` исключает state. Resume after crash работает.

### LangSmith

`LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY=...`, `LANGCHAIN_PROJECT=artka-blog`. После run сохраняем trace_id в `agent_runs`, в админке — кнопка "Open in LangSmith".

### Token & cost tracking

```python
PRICING = {  # USD per M tokens
    'claude-haiku-4-5-20251001': (1.0, 5.0),
    'claude-sonnet-4-6-...':      (3.0, 15.0),
    'claude-opus-4-7-...':        (15.0, 75.0),
}
```
После каждого LLM call — `UPDATE agent_runs SET model_calls=..., input_tokens=..., output_tokens=..., cost_usd=...`. pg_notify будит SSE.

**Дублирование с LangSmith — сознательное.** LangSmith = source of truth для traces. `agent_runs.cost_usd` = локальный snapshot для dashboard, который должен работать без зависимости от LangSmith uptime/quota и без выходов в их API. Источник может разойтись — для алертов берём LangSmith (всё равно платный), для daily totals в админке — локальный.

### Зависимости

`pyproject.toml`: fastapi, uvicorn, asyncpg, pydantic, anthropic, langchain, langchain-anthropic, langgraph, langgraph-checkpoint-postgres, langsmith, httpx, trafilatura, apscheduler, structlog. Управляются через `uv`.

### Schema sync TS ↔ Python

Drizzle owns миграции. Python пишет/читает через сырой SQL + Pydantic-модели.

**Защита от drift:** integration test в Python (`tests/test_schema_parity.py`):
- Запускается на CI с реальным testcontainers Postgres + applied Drizzle migrations
- Через `information_schema` сверяет: каждая колонка из Pydantic-модели существует в БД, типы совместимы (text↔str, jsonb↔dict, timestamptz↔datetime), nullable согласован
- Падает, если модель и схема разъехались. PR не мержится.

Кодген (datamodel-code-generator из drizzle introspect) — отложен до момента, когда таблиц станет >10 или ручная синхронизация даст 2+ silent drift в год. Пока единый integration test дешевле и достаточен.

### Первые агенты

1. `draft_from_url` — `{url}` → fetch + extract (trafilatura) + LLM → INSERT into posts (status=draft) + agent_artifact
2. `rss_monitor` — каждые 30 мин (cron), читает feeds, складывает rss_seeds в artifacts
3. `daily_digest` — 8:00 UTC, summary из rss_seeds → digest artifact для просмотра в админке
4. `translate` — port из `scripts/translate.ts` (после миграции БД)
5. `social_drafts` — port из `lib/social/*` (после translate)

## 7. Admin SPA

### Стек
Vite 6 + React 19 + TS strict + TanStack Router (file-based) + TanStack Query + shadcn/ui (Radix + Tailwind 4) + react-hook-form + Zod + CodeMirror 6 + EventSource.

### Маршруты
```
admin/src/routes/
├── __root.tsx          shell + RequireAuth
├── index.tsx           Dashboard
├── login.tsx
├── posts/{index, new, $id}.tsx
├── projects/{index, $id}.tsx
├── pages/$slug.tsx
├── media/index.tsx
├── jobs/{index, $id}.tsx
├── agents/trigger.tsx
└── settings/index.tsx
```

### Ключевые экраны
- **Dashboard:** counts за 24h (pending/running/completed/failed), latest agent drafts, quick triggers.
- **Posts editor:** TopBar (title, status, Save/Publish), left frontmatter form, center CodeMirror MD editor, right preview iframe (server-rendered, debounced 500ms `POST /admin/render/preview`), sidebar (revisions, linked social drafts, linked agent runs).
- **Job board:** filter bar, live SSE list (status badges, cost, duration), click → detail.
- **Job detail:** payload, runs (если retry), artifacts (json viewer), LangSmith link.
- **Agent trigger wizard:** discriminated union form per kind, submit → POST /admin/jobs.

### SSE
```typescript
// admin/src/lib/sse.ts — useJobsStream() in __root.tsx
new EventSource('/api/v1/admin/jobs/stream', { withCredentials: true })
// → invalidateQueries on events
```

### Build/deploy

```dockerfile
FROM node:24-bookworm-slim AS builder
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter=@artka/admin build
FROM nginx:alpine
COPY --from=builder /app/admin/dist /usr/share/nginx/html
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
```

Static SPA, nginx fallback на `index.html`.

### Shared types

`packages/shared/`:
- `src/api/{posts,jobs,auth}.ts` — Zod схемы
- `src/domain/{post,job,agent}.ts` — TS types
Импортируются в Hono + admin. Python — Pydantic вручную (узкий контракт payload).

### Design tokens

shadcn/ui в admin использует Tailwind CSS variables. Astro frontend имеет свои tokens в `src/styles/tokens.css`. На MVP — admin владеет своим набором (shadcn defaults, можно настроить под свой brand). **Tokens между Astro и admin не шарим** — у них разные UX контексты (publika vs internal tool). Если когда-то понадобится единая визуальная система — выделим `packages/design-tokens/` с CSS-переменными.

## 8. Migration plan

Сроки — реалистичные для одного разработчика после critic-ревью (исходные оценки были оптимистичны на 2x). Каждая Phase имеет **falsifiable done condition** — без неё не считаем завершённой.

| Phase | Дни | Done condition |
|---|---|---|
| 0 Foundation | 3-4 | docker-compose up даёт зелёные healthcheck'и для postgres, hono, render, agents (заглушки), admin (заглушка). Dokploy/Traefik раздаёт 3 поддомена с TLS через свой built-in resolver. GH Actions paths-filter билдит правильный image. |
| 1 Schema | 1-2 | `pnpm db:migrate` идемпотентен. `pg_notify('agent_jobs_pending')` срабатывает при INSERT (verified `psql LISTEN`). Postgres roles созданы, grants выданы. Rollback миграция reverts чисто. |
| 2 Migrate content | 1-2 | `count(posts WHERE kind='post') = count(markdown files)`. `count(body_html IS NOT NULL) = count(posts)`. Spot-check 3 поста: rendered output байт-в-байт = текущий prod output (или объяснимо отличается). |
| 3 Hono API + render-service | 5-7 | Все 25+ endpoints отвечают. Каждый endpoint имеет 200/400/401/403/404 тесты. Render preview p95 < 2 сек на типичном посте (3 mermaid + 2 katex). SSE `/jobs/stream` доставляет события из синтетических INSERT'ов в agent_jobs. Better-Auth login/logout/get-session работает с `SameSite=None` cookie. |
| 4 Astro → API | 2-3 | `prerender=false`. Все 11 RU + 5 EN постов на тех же URL. Autocannon 30s c10 — p95 в пределах 2x от текущего SSG (или зафиксировано «приемлемо»). Astro fallback: при `api` down — отдаёт last-known body_html + warning header. |
| 5 Admin SPA | 6-8 | Login → create post → edit → save revision → restore revision → publish → видно на artka.dev в течение 5 секунд. Media upload работает. Все Astro `/admin/*` отдают 308 на admin.artka.dev. |
| 6 First agent + reaper | 5-7 | INSERT job через psql вручную → worker подхватывает в течение 2 сек (LISTEN). Artifacts появляются. SSE доставляет update в открытую вкладку. Cancel mid-flight реально останавливает run. **Reaper тестируется**: убил процесс mid-job → через 60 сек job возвращается в pending или fails. LangSmith trace доступен. |
| 7 Translate port | 4-5 | Все валидаторы (length, structural markers, per-key hash) портированы. Паритет на 5 контрольных постах. `scripts/translate.ts` **удалён**. |
| 8 Social port | 6-8 | Writer/editor/critic в LangGraph. Smoke test на одном посте → drafts в `socialPosts`. `lib/social/*` **удалён**. |
| 9 New agents | по мере | rss_monitor, daily_digest добавляются по одному, каждый с тестом. |
| 10 Cleanup | 2 | Удалены: markdown файлы, `src/content.config.ts`, `pnpm translate:check` в CI, `src/pages/admin/**`, `src/actions/**`, `rehype-mermaid` из astro.config, pagefind. CLAUDE.md обновлён. |
| **Итого core (Phase 0-8)** | **35-46 дней** | |

Phases 9-10 идут поверх рабочей системы.

### Rollback (честно)

- **До Phase 4 включительно** — обратимо. Astro может читать markdown через env flag `READ_POSTS_FROM=files`.
- **С Phase 5** — точка невозврата. Admin SPA = source истины для editing, и markdown файлы устаревают мгновенно. Обратно — только через export-job (Phase 9 кандидат, см. Section 12 risks).
- **С Phase 7-8** — старый TS-код удаляется. Откат = git revert и исправить разъезды БД.

Не делаем вид, что rollback существует там, где его реально нет.

### Phase 9 кандидат: `export_to_git` job

После каждого publish — job kind=`export_to_git` пишет post в `_archive/posts/<slug>.md` и коммитит. Это **append-only audit trail**, не двусторонний sync. Дёшево, спасает от «БД упала, что писали неделю назад». Не блокер для MVP.

## 9. Error handling & observability

### Logging
- **Hono:** pino, JSON, fields request_id/user_id/path/method/status/duration_ms.
- **Python:** structlog, JSON, fields job_id/run_id/kind/attempt/langsmith_trace_id.
- **Admin SPA:** console + опциональный Sentry.
- **Astro:** pino как сейчас.

### Error taxonomy
| Layer | Тип | Ответ |
|---|---|---|
| Validation (Hono) | ZodError | 400 + details |
| Auth | no session / wrong role | 401/403 |
| DB constraint | unique violation | 409 |
| External API (Anthropic) | 429/5xx | retry в LangGraph node, после 3 — fail run |
| Python worker | uncaught exception | mark run failed, reschedule if attempts < max |
| Astro SSR | API недоступен | 503 page + log |
| Render (Playwright) | timeout/crash | retry 1, иначе fail render, body_html=null |

### LangSmith
Each run автоматически трейсится через `LANGCHAIN_TRACING_V2`. В job detail UI — link на LangSmith UI.

### Healthchecks
- Astro: `GET /`
- Hono: `GET /health` → `{db, auth}`
- Python: `GET /health` → `{db, worker, last_claim}`
- Postgres: `pg_isready`

### Cost tracking
Каждый LLM call → UPDATE agent_runs. Dashboard показывает суммарно за день/неделю/месяц. Optional alert при превышении threshold.

## 10. Testing

### Hono API
- Vitest unit (utils, schemas)
- Vitest integration (testcontainers Postgres) — каждый endpoint happy + error path
- Auth flow с тестовым пользователем

### Astro
- Vitest для loaders (mock fetch)
- Playwright E2E против docker-compose

### Python agent service
- pytest для tools (mock httpx, testcontainers Postgres)
- Graph integration с mocked Anthropic (httpx.MockTransport)
- Worker integration: INSERT job → assert artifacts populated

### Admin SPA
- Vitest для hooks
- Testing Library для форм
- Playwright E2E

### Anti-patterns (CLAUDE.md)
- Не пишем `expect(fn).toBeDefined()`
- Mock только внешние границы (Anthropic, OAuth, RSS)
- Integration на реальной БД через testcontainers

### Critical scenarios — обязательные тесты

- **Hono LISTEN reconnect.** Drop listen connection → assert reconnect + replay events с `Last-Event-ID`.
- **SKIP LOCKED concurrency.** 2 worker'а одновременно → каждый job клеймится ровно одним.
- **Retry idempotency.** `draft_from_url` retry 3x с одинаковым `idempotency_key` → один draft post в БД.
- **Schema parity TS↔Python.** Pydantic models match Drizzle introspection (см. Section 6).
- **Reaper.** Kill worker mid-run → через 60 сек reaper освобождает claim.
- **render_version invalidation.** Bump version → enqueue rerender_all → all posts get fresh body_html.
- **Cross-language FK.** Delete RU post — что с EN twin? (FK поведение должно быть документировано: independent rows, CASCADE через `lang_pair_id`? — решить на Phase 1).
- **rehype-sanitize.** Подаём body_md с `<script>alert(1)</script>` → body_html не содержит script.
- **Playwright crash recovery.** Mermaid render фейлится → post остаётся `status=draft`, не публикуется с пустым body_html.
- **CORS + cookie.** admin.artka.dev fetch на api.artka.dev с credentials — cookie уходит, server видит сессию.

### CI matrix
test-api / test-frontend / test-admin / test-agents / e2e (depends on previous).

## 11. Deployment

### docker-compose

Сервисы: **postgres, api, render, frontend, admin, agents** (6 контейнеров) под управлением Dokploy 0.29.2 — он сам поднимает Traefik как reverse-proxy и Let's Encrypt resolver. Собственный Caddy/nginx не требуется. Все через ghcr.io images. Healthchecks, depends_on с condition: service_healthy.

`render` — отдельный stateless контейнер с Node + Playwright + unified pipeline. Не мониторит pgmq/agent_jobs. Hono вызывает по HTTP `/render` (preview) и `/render-and-store` (на publish). Restart render не влияет на auth/SSE. Render без публичных Traefik labels — доступен только в `dokploy-network`.

### Routing — Dokploy Traefik labels

Каждый публичный сервис в compose объявляет свои routers как labels:

```yaml
api:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.api-artka-secure.rule=Host(`api.artka.dev`)"
    - "traefik.http.routers.api-artka-secure.entrypoints=websecure"
    - "traefik.http.routers.api-artka-secure.tls.certResolver=letsencrypt"
    - "traefik.http.routers.api-nltosql-secure.rule=Host(`api.nltosql.com`)"
    - "traefik.http.routers.api-nltosql-secure.entrypoints=websecure"
    - "traefik.http.routers.api-nltosql-secure.tls.certResolver=letsencrypt"
    - "traefik.http.routers.api-nltosql-secure.middlewares=staging-noindex@docker"
    - "traefik.http.services.api.loadbalancer.server.port=3001"
    - "traefik.http.middlewares.staging-noindex.headers.customresponseheaders.X-Robots-Tag=noindex, nofollow, noarchive"
  networks: [dokploy-network]
```

Аналогично admin (всегда noindex, оба домена), frontend в Plan 2. Render — без публичных labels.

### GitHub Actions
- `ci.yml` — тесты на каждый PR
- `docker-publish-{api,render,frontend,admin,agents}.yml` — paths-фильтр, билд + push в ghcr + Dokploy webhook

### Env files (gitignored)
- `.env.api` — `DATABASE_URL` (role: app_writer), BETTER_AUTH_SECRET, GITHUB_OAUTH, RENDER_SERVICE_URL=http://render:3002
- `.env.render` — `DATABASE_URL` (role: render_reader, read-only)
- `.env.frontend` — `DATABASE_URL` (role: public_reader, read-only) или просто API_URL=http://api:3001
- `.env.agents` — `DATABASE_URL` (role: agent_writer), ANTHROPIC_API_KEY, LANGSMITH_API_KEY, LANGCHAIN_PROJECT, LANGGRAPH_PG_SCHEMA=langgraph
- `.env` — POSTGRES superuser (только для миграций), TAG

### DB backup
`pg_dump --format=c` ежедневно в S3, restore-test раз в месяц.

### Monitoring (минимум)
Healthchecks в Docker, Traefik access logs (Dokploy UI → Logs или `docker logs dokploy-traefik`), pg_stat_statements, LangSmith dashboard.

## 12. Open questions / risks

### Resolved (раньше были open, после ревью закрыты)
- ~~Render pipeline в Hono~~ → **выделен `render-service` контейнер.** Hono без Playwright. Crash render не валит auth/SSE.
- ~~LangGraph schema в той же БД~~ → **отдельный schema `langgraph`** (`LANGGRAPH_PG_SCHEMA`).
- ~~Cookie SameSite=Lax~~ → **`SameSite=None; Secure`** для cross-subdomain SPA.
- ~~Pydantic-Drizzle drift руками~~ → **integration test schema parity** в CI.
- ~~`hidden_from_list` колонка~~ → **`status='unlisted'`** в enum.
- ~~Stale-claim recovery~~ → **`reaper_loop`** в Python service Phase 6.
- ~~SSE replay~~ → **`Last-Event-ID` + `agent_events` таблица** с monotonic ID.

### Still open
1. **Конкретные плагины render pipeline:** `unified` + `remark-parse` + `remark-gfm` + `remark-math` + `remark-rehype` + `rehype-raw` (для HTML внутри MD) + **`rehype-sanitize`** с строгой schema + `rehype-slug` + `rehype-autolink-headings` + `rehype-external-links` + `rehype-code-titles` + `rehype-mermaid` (strategy `img-svg`, dark) + `rehype-katex` + `rehype-shiki` → `rehype-stringify`. Конфигурацию портируем 1-в-1 из `astro.config.ts`. **`rehype-sanitize` обязателен**: `body_md` для draft_from_url приходит из LLM на основе внешних URL — без sanitize риск XSS через `<script>` или `<iframe>` в Markdown raw HTML. Sanitize schema whitelist'ит KaTeX/Mermaid SVG элементы.
2. **CSP для Astro.** При `set:html={post.body_html}` нужен strict CSP: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (KaTeX inline styles) `; script-src 'self'`. Текущий CSP-Report-Only в middleware → переписать с учётом render output.
3. **Markdown vs MDX.** Текущие посты — pure markdown. `posts.body_md` хранит только markdown без MDX-синтаксиса. JSX-компоненты не поддерживаются. Если потребуется — добавим whitelist shortcodes (`:::callout` → rehype-плагин).
4. **Render version invalidation.** При изменении rehype-плагинов bump `render_version`, enqueue job kind=`rerender_all`. Worker по одному пересчитывает все posts. Нужно добавить тест.
5. **Search FTS на jsonb FAQ.** В Phase 1 search_vector только из (title, description, summary, body_md, tags). FAQ — потом, расширим триггер.
6. **Image upload в admin.** `POST /api/v1/admin/media/upload` принимает multipart, пишет файл в `public/uploads/<yyyy>/<mm>/<hash>.<ext>` и row в `media_assets`. На MVP диск достаточен; миграция на S3 — когда упрёмся в место.
7. **Astro fallback при недоступности Hono.** Реализация: Astro кэширует body_html на диск в `node_modules/.cache/posts-fallback/<slug>-<lang>.html` при успешном fetch. На fail Hono — отдаёт из кэша. `Cache-Control: stale-if-error=86400`. Это убирает SPOF.
8. **LangSmith vendor lock.** Бесплатный план 5k traces/мес. При активной разработке быстро. Альтернатива — self-host Langfuse/Phoenix в том же compose. **Решение:** на MVP — LangSmith. Если уйдём за лимит — переключимся на self-host (адаптер уже изолирован в `tools/llm.py`).
9. **`extra jsonb` polymorphism для projects.** Risk через 6 месяцев. Mitigation: Zod-схема per kind в `packages/shared/src/domain/extra/`, валидация на write (Hono). Если разрастётся — выделим отдельную таблицу `project_details`.
10. **`agent_artifacts.content jsonb` без типизации.** Тот же risk. Mitigation: Pydantic-модели per kind в `agents/src/agents/artifacts/`, валидация на write. Через год оценим, не выделить ли отдельные таблицы per kind.
11. **`socialPosts` после миграции social_drafts.** Оставляем как outbox: это external-side-effect record, не результат агента. Наполняется через approve flow в админке.

## 13. Glossary

- **Job (`agent_jobs`)** — единица работы агента, поставленная в очередь.
- **Run (`agent_runs`)** — конкретное исполнение job (1 job → N runs если retry).
- **Artifact (`agent_artifacts`)** — output работы (draft, перевод, critic note, rss_seed).
- **Kind** — тип агента: `draft_from_url`, `translate`, `social_drafts`, `rss_monitor`, `daily_digest`, ...
- **render_version** — int, bump при изменении rehype-pipeline для инвалидации `body_html`.

## 13a. Staging deployment & production cutover

**Цель:** разработка ведётся на ветке `refactor/postgres-cms-agents`, деплоится на **nltosql.com** (запасной домен), `artka.dev` продолжает жить на текущем стеке. Когда staging готов — переключаем DNS, забираем SEO с собой, не теряем ни одной публичной ссылки.

### Принципы

1. **Изоляция staging.** nltosql.com = полная копия архитектуры (postgres, api, render, frontend, admin, agents под управлением Dokploy/Traefik), но **отдельная БД** (не shared с прод). Это исключает кросс-влияние на artka.dev.
2. **Закрыто для индексации на период разработки.** Любой ответ от nltosql.com — `X-Robots-Tag: noindex, nofollow`, `<meta name="robots" content="noindex,nofollow">`, `robots.txt = Disallow: /`. Контролируется одним env var `INDEXATION_ENABLED=false`.
3. **URL-паритет.** Все existing public URLs на artka.dev должны работать на nltosql.com по тем же путям (`/`, `/blog/<slug>`, `/en/blog/<slug>`, `/about`, `/now`, `/uses`, `/projects`, `/projects/<slug>`, `/tags`, `/tags/<tag>`, `/rss.xml`, `/sitemap-index.xml`, `/sitemap-0.xml`, `/og-default.svg`, `/uploads/...`). Pre-cutover audit проверяет каждый.
4. **SEO-метаданные сохраняются.** Canonical, OG, Twitter card, schema.org структуры — генерируются по тем же правилам. На staging canonical всегда указывает на свой домен (`https://nltosql.com/...`), на prod — на `https://artka.dev/...`. Это контролируется env var `SITE_URL`.
5. **Redirect map.** Если в новой архитектуре какой-то URL изменится (например, был `/blog/X` стал `/posts/X` — НЕ планируется, но если случайно) — добавляем 301 redirect через Astro middleware ИЛИ Traefik `redirectregex` middleware (compose labels). Аудит: cross-check sitemap до/после.

### Env-переменные, контролирующие поведение

```
# .env.staging (на сервере nltosql.com)
SITE_URL=https://nltosql.com
INDEXATION_ENABLED=false
BETTER_AUTH_URL=https://api.nltosql.com
COOKIE_DOMAIN=.nltosql.com

# .env.production (на сервере artka.dev)
SITE_URL=https://artka.dev
INDEXATION_ENABLED=true
BETTER_AUTH_URL=https://api.artka.dev
COOKIE_DOMAIN=.artka.dev
```

Каждый сервис читает `SITE_URL` для построения canonical/OG/RSS URLs. `INDEXATION_ENABLED=false` включает noindex-режим во всех ответах:
- **Astro middleware** — добавляет `X-Robots-Tag: noindex, nofollow` к каждому ответу, инжектит `<meta name="robots" content="noindex,nofollow">` в layout если `INDEXATION_ENABLED !== "true"`.
- **`/robots.txt`** — endpoint в Astro возвращает `User-agent: *\nDisallow: /` если staging, иначе нормальный robots с allow + sitemap link.
- **Dokploy/Traefik** — для каждого staging-router'а (`api.nltosql.com`, `admin.nltosql.com`, `nltosql.com`) указан `middlewares=staging-noindex@docker`, который инжектит `X-Robots-Tag: noindex, nofollow, noarchive`. Production-routers (`*.artka.dev`) этого middleware не получают.
- **API responses** — Hono тоже выставляет header (на случай прямых ссылок на api.nltosql.com).

### Cutover-процедура (2-3 часа в один заход)

1. **Pre-cutover audit (1 ч):**
   - Скрипт `scripts/url-parity-check.ts` — для каждого URL из текущего sitemap.xml на artka.dev делает GET nltosql.com/<path>, проверяет 200 + content-length > N + наличие правильного `<title>`. Любой 404 — блокер.
   - Cross-check sitemap-index размер (количество URLs).
   - Spot-check 10 random posts: открыть в браузере, сравнить content-bytes с прод (cosmetic differences ok, semantic — нет).
   - GSC export: текущая Coverage report на artka.dev — чтобы было с чем сравнивать после cutover.

2. **Финальный data-sync (если нужен):** на staging должна быть свежая копия prod-БД. Либо `pg_dump prod | pg_restore staging` за час до cutover, либо последний раз импортировать всю свежую markdown через `migrate-content-to-db` (если markdown ещё source истины на проде).

3. **DNS swap:**
   - Обновить A/AAAA `artka.dev` → IP сервера, где работает refactor stack (тот же что обслуживает nltosql.com, либо отдельный — решается на уровне infra).
   - Обновить A/AAAA `api.artka.dev`, `admin.artka.dev` аналогично.
   - TTL на DNS снизить за 24ч до cutover до 60 секунд, чтобы swap прошёл быстро.

4. **Dokploy redeploy с production env:**
   - Compose-приложение в Dokploy получает env `INDEXATION_ENABLED=true`, `SITE_URL=https://artka.dev`, `BETTER_AUTH_URL=https://api.artka.dev`, `COOKIE_DOMAIN=.artka.dev` (через UI или импорт из `infra/.env.production.example`). Re-deploy инициирует pickup новых env и переподнимает контейнеры.
   - Traefik (часть Dokploy) автоматически выпустит реальные TLS-сертификаты от Let's Encrypt по новым DNS-записям artka.dev / api.artka.dev / admin.artka.dev.
   - Старый Astro-стек в Dokploy — оставляем развёрнутым ещё 24 часа как fallback (можно временно остановить через UI).

5. **Robots/Sitemap flip:**
   - `https://artka.dev/robots.txt` теперь allow + sitemap link.
   - Submit `sitemap-index.xml` в Google Search Console (re-fetch).
   - В GSC сделать "Request indexing" для главных страниц (homepage, top 10 posts).

6. **Cleanup nltosql.com:**
   - **Variant A (рекомендую):** оставить nltosql.com как продолжающийся staging — будущие feature-ветки деплоятся туда, prod (artka.dev) только мерж из main.
   - **Variant B:** освободить домен. Тогда добавить 301 redirect от `https://nltosql.com/*` → `https://artka.dev/*` через Traefik middleware labels (`traefik.http.middlewares.nltosql-redirect.redirectregex.*`).

7. **48-часовой monitoring:**
   - Traefik access logs (Dokploy UI → Logs или `docker logs dokploy-traefik`): фильтр на 4xx/5xx, smoke по топ-10 URL'ов
   - Plausible (если используется): сравнение трафика и bounce rate с baseline (последняя неделя до cutover)
   - GSC Coverage report: убедиться что новые URLs индексируются, не появилось `Excluded → Not found (404)` всплеска
   - Sentry/error logs: regressions ловить

### Что точно НЕ меняется в URL-схеме

URL-схема **байт-в-байт** копируется со старого Astro-сайта. Это означает:
- Slug формат: `[a-z0-9][a-z0-9-]*` (тот же regex)
- Routing: `/blog/<slug>`, `/en/blog/<slug>`, `/about`, `/now`, `/uses`, `/projects`, `/projects/<slug>`, `/tags`, `/tags/<tag>`, `/rss.xml`
- 301-redirect map для legacy paths (см. `astro.config.ts:redirects`) — портируется в Astro middleware (или Traefik `redirectregex` labels) 1-в-1
- OG image URLs (`/og-default.svg` или генерируемые) — те же пути

### План в Plans

- **Plan 1 Task NEW:** настроить Traefik labels на сервисах api/admin с conditional noindex middleware для staging routers, env scaffolding (SITE_URL, INDEXATION_ENABLED, COOKIE_DOMAIN), robots.txt endpoint в Astro
- **Plan 2 Task NEW:** Astro middleware применяет noindex headers + meta tag, canonical URL читает SITE_URL
- **Plan 6 Task NEW:** Production cutover — pre-audit, DNS swap, robots flip, GSC re-submit, 48h monitoring

## 14. Out of scope (явный no-go)

- Multi-tenant
- CDN/edge deploy
- Collaborative editing
- Drag-and-drop reorder
- Cropping/Cloudinary в media manager
- Automatic translation memory beyond per-key hash
- Полный graceful migration old → new TS-агентов: они мигрируются по одному после паритета

---

**End of design.**
