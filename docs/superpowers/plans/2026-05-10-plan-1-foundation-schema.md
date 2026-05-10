# Plan 1 / 6: Foundation + Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить инфраструктурный фундамент для рефакторинга — pnpm workspace структура, новые таблицы Postgres с pg_notify триггерами, Postgres role separation, stub healthcheck-сервисы для api/render/admin/agents.

**Architecture:** Существующее Astro приложение остаётся в корне репозитория (минимум disruption). Новые workspaces создаются как sub-directories: `api/`, `render/`, `admin/`, `agents/`, `packages/shared/`. Drizzle schema расширяется новыми таблицами (`posts`, `agent_jobs`, `agent_runs`, `agent_artifacts`, `agent_events`) — старые `postsMeta`, `postRevisions`, `socialPosts` остаются нетронутыми (миграция данных в Plan 2). Postgres roles `app_reader`, `app_writer`, `agent_writer`, `render_reader` создаются с минимальными grants. Stub-сервисы возвращают `200 /health` и больше ничего — реальная логика в последующих планах.

**Tech Stack:** pnpm 10 workspaces, Drizzle ORM + drizzle-kit, PostgreSQL 18, Hono (для API stub), Fastify-style minimal HTTP servers, Docker Compose, Caddy 2, GitHub Actions paths-filter.

**Spec:** `docs/superpowers/specs/2026-05-10-postgres-cms-agents-design.md` (Phase 0-1).

---

## File Structure

### New files
- `pnpm-workspace.yaml` — workspace root config
- `api/package.json`, `api/src/index.ts`, `api/Dockerfile`, `api/tsconfig.json`
- `render/package.json`, `render/src/index.ts`, `render/Dockerfile`, `render/tsconfig.json`
- `admin/package.json`, `admin/index.html`, `admin/Dockerfile`, `admin/nginx.conf`, `admin/vite.config.ts`, `admin/src/main.tsx`
- `agents/pyproject.toml`, `agents/src/agents/__init__.py`, `agents/src/agents/main.py`, `agents/src/agents/health.py`, `agents/Dockerfile`
- `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/tsconfig.json`
- `drizzle/0006_postgres_cms_agents.sql` — Drizzle-generated migration
- `drizzle/0007_triggers_and_roles.sql` — manual SQL migration
- `infra/Caddyfile` — reverse proxy config
- `infra/docker-compose.dev.yml` — dev override (отдельно от prod)
- `.github/workflows/docker-publish-api.yml`
- `.github/workflows/docker-publish-render.yml`
- `.github/workflows/docker-publish-admin.yml`
- `.github/workflows/docker-publish-agents.yml`

### Modified files
- `package.json` — добавить `workspaces` поле (через pnpm-workspace.yaml), сохранить root-level scripts для Astro
- `src/lib/db/schema.ts` — добавить новые tables (см. Task 4)
- `docker-compose.yml` — добавить сервисы api, render, admin, agents, caddy
- `.gitignore` — добавить `agents/.venv`, `agents/__pycache__`, `**/dist/`

### Untouched in this plan
- `src/content/posts/`, `src/content/site/` — markdown переезжают в Plan 2
- Astro `src/pages/`, `src/actions/`, `src/middleware.ts` — мигрируются в Plans 2-3
- `lib/translate/`, `lib/social/` — мигрируются в Plans 5-6

---

## Task 1: Set up pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

Path: `/Users/izual/astro-blog/pnpm-workspace.yaml`

```yaml
packages:
  - "."
  - "api"
  - "render"
  - "admin"
  - "agents"
  - "packages/*"
```

Root (`.`) остаётся текущим Astro приложением. Sub-packages добавятся в следующих задачах.

- [ ] **Step 2: Update `.gitignore`**

Append to `/Users/izual/astro-blog/.gitignore`:

```
# Workspace artifacts
**/dist/
**/.turbo/
**/node_modules/

# Python (для agents/)
agents/.venv/
agents/__pycache__/
agents/**/__pycache__/
agents/.pytest_cache/
agents/uv.lock.bak
**/*.pyc

# Render service Playwright cache
render/.playwright-cache/
```

- [ ] **Step 3: Verify pnpm install passes**

Run: `cd /Users/izual/astro-blog && pnpm install`
Expected: install succeeds, no warnings about missing workspaces (subdirs не существуют, но workspace pattern их допускает; pnpm warning'и о пустых паттернах — норма).

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml .gitignore
git commit -m "chore(workspace): bootstrap pnpm workspace for refactor"
```

---

## Task 2: Create `packages/shared` workspace skeleton

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

Path: `/Users/izual/astro-blog/packages/shared/package.json`

```json
{
  "name": "@artka/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

Path: `/Users/izual/astro-blog/packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/src/index.ts`**

Path: `/Users/izual/astro-blog/packages/shared/src/index.ts`

```typescript
// @artka/shared - centralized Zod schemas and TS types shared across services.
// Will be populated in Plan 2+. Empty stub for now.
export const SHARED_VERSION = "0.0.0";
```

- [ ] **Step 4: Install и verify**

```bash
pnpm install
pnpm --filter=@artka/shared exec tsc --noEmit
```

Expected: tsc passes, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "chore(shared): add @artka/shared workspace skeleton"
```

---

## Task 3: Create stub services (api, render, admin, agents)

Каждый stub — минимум кода, чтобы Docker healthcheck проходил.

**Files:**
- Create: `api/package.json`, `api/src/index.ts`, `api/tsconfig.json`, `api/Dockerfile`
- Create: `render/package.json`, `render/src/index.ts`, `render/tsconfig.json`, `render/Dockerfile`
- Create: `agents/pyproject.toml`, `agents/src/agents/__init__.py`, `agents/src/agents/main.py`, `agents/Dockerfile`
- Create: `admin/package.json`, `admin/index.html`, `admin/vite.config.ts`, `admin/src/main.tsx`, `admin/Dockerfile`, `admin/nginx.conf`

### 3a: API stub (Hono)

- [ ] **Step 1: Create `api/package.json`**

Path: `/Users/izual/astro-blog/api/package.json`

```json
{
  "name": "@artka/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "@artka/shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

Path: `/Users/izual/astro-blog/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `api/src/index.ts`**

Path: `/Users/izual/astro-blog/api/src/index.ts`

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "api", version: process.env.GIT_SHA ?? "dev" }),
);

app.get("/", (c) => c.text("artka-api stub. See /health"));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`api listening on :${port}`);
```

- [ ] **Step 4: Create `api/Dockerfile`**

Path: `/Users/izual/astro-blog/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=@artka/api...

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/api/node_modules ./api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY api/ ./api/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/api

ARG GIT_SHA=unknown
ENV NODE_ENV=production PORT=3001 GIT_SHA=$GIT_SHA

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
```

### 3b: Render service stub

- [ ] **Step 5: Create `render/package.json`**

Path: `/Users/izual/astro-blog/render/package.json`

```json
{
  "name": "@artka/render",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 6: Create `render/tsconfig.json`**

Path: `/Users/izual/astro-blog/render/tsconfig.json` — копия `api/tsconfig.json` (тот же содержимое).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create `render/src/index.ts`**

Path: `/Users/izual/astro-blog/render/src/index.ts`

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "render" }));

const port = Number(process.env.PORT ?? 3002);
serve({ fetch: app.fetch, port });
console.log(`render listening on :${port}`);
```

- [ ] **Step 8: Create `render/Dockerfile`**

Path: `/Users/izual/astro-blog/render/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY render/package.json ./render/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=@artka/render...

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/render/node_modules ./render/node_modules
COPY render/ ./render/
WORKDIR /app/render

ENV NODE_ENV=production PORT=3002

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
```

### 3c: Agents service stub (Python)

- [ ] **Step 9: Create `agents/pyproject.toml`**

Path: `/Users/izual/astro-blog/agents/pyproject.toml`

```toml
[project]
name = "artka-agents"
version = "0.0.0"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "ruff>=0.8",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/agents"]
```

- [ ] **Step 10: Create `agents/src/agents/__init__.py`**

Path: `/Users/izual/astro-blog/agents/src/agents/__init__.py`

```python
__version__ = "0.0.0"
```

- [ ] **Step 11: Create `agents/src/agents/main.py`**

Path: `/Users/izual/astro-blog/agents/src/agents/main.py`

```python
import os
from fastapi import FastAPI
import uvicorn

app = FastAPI(title="artka-agents")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agents"}


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    run()
```

- [ ] **Step 12: Create `agents/Dockerfile`**

Path: `/Users/izual/astro-blog/agents/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN pip install --no-cache-dir uv==0.5.5

WORKDIR /app
COPY pyproject.toml ./
RUN uv venv && uv pip install --no-cache-dir -e .

COPY src/ ./src/

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uv", "run", "python", "-m", "agents.main"]
```

Note: agents/Dockerfile использует только `agents/` каталог как build context (не root). При сборке: `docker build -t artka-agents agents/`. Это упрощает Python-build, не пытаясь делиться node_modules.

### 3d: Admin SPA stub (Vite)

- [ ] **Step 13: Create `admin/package.json`**

Path: `/Users/izual/astro-blog/admin/package.json`

```json
{
  "name": "@artka/admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@artka/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.9.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 14: Create `admin/index.html`**

Path: `/Users/izual/astro-blog/admin/index.html`

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>artka admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 15: Create `admin/vite.config.ts`**

Path: `/Users/izual/astro-blog/admin/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 16: Create `admin/src/main.tsx`**

Path: `/Users/izual/astro-blog/admin/src/main.tsx`

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>artka admin (stub)</h1>
      <p>Plan 1 healthcheck — replaced in Plan 3.</p>
    </main>
  </StrictMode>,
);
```

- [ ] **Step 17: Create `admin/tsconfig.json`**

Path: `/Users/izual/astro-blog/admin/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 18: Create `admin/nginx.conf`**

Path: `/Users/izual/astro-blog/admin/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /health {
        access_log off;
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

- [ ] **Step 19: Create `admin/Dockerfile`**

Path: `/Users/izual/astro-blog/admin/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY admin/package.json ./admin/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=@artka/admin...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/admin/node_modules ./admin/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY admin/ ./admin/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter=@artka/admin build

FROM nginx:alpine AS runtime
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1
```

- [ ] **Step 20: Install all workspaces**

```bash
cd /Users/izual/astro-blog
pnpm install
```

Expected: install succeeds, all workspaces resolved, no errors.

- [ ] **Step 21: Verify each stub TypeScript compiles**

```bash
pnpm --filter=@artka/api typecheck
pnpm --filter=@artka/render typecheck
pnpm --filter=@artka/admin typecheck
```

Expected: всё проходит.

- [ ] **Step 22: Smoke test agents Python install**

```bash
cd /Users/izual/astro-blog/agents
uv venv .venv
uv pip install -e .
uv run python -c "from agents.main import app; print(app.title)"
```

Expected: prints `artka-agents`. Если uv не установлен — `pipx install uv` или `pip install uv`.

- [ ] **Step 23: Commit**

```bash
git add api/ render/ admin/ agents/
git commit -m "chore(stubs): add api/render/admin/agents healthcheck stubs"
```

---

## Task 4: Drizzle schema — new tables

Добавляем новые таблицы в schema.ts. Старые таблицы остаются нетронутыми — миграция данных в Plan 2.

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add new schema imports**

В файле `src/lib/db/schema.ts`, в самом верху (до существующих imports), добавить ничего не нужно — `pgEnum`, `numeric`, `text` всё уже есть. Но `numeric` отсутствует. Добавить в существующий import:

Старая строка (1-15):
```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  pgEnum,
  jsonb,
  serial,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
```

Заменить на:
```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  bigserial,
  numeric,
  pgEnum,
  jsonb,
  serial,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Append new enums**

В конец `src/lib/db/schema.ts` (после существующего `export { primaryKey };`) добавить:

```typescript
// ── Refactor v2: Postgres-as-CMS + agents ─────────────────────

export const postKind = pgEnum("post_kind", ["post", "page", "project"]);
export const postStatus = pgEnum("post_status", ["draft", "published", "unlisted", "archived"]);
export const postLang = pgEnum("post_lang", ["ru", "en"]);

export const agentJobStatus = pgEnum("agent_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const agentRunStatus = pgEnum("agent_run_status", ["running", "completed", "failed"]);
```

- [ ] **Step 3: Append `posts` table**

Append to `src/lib/db/schema.ts`:

```typescript
/**
 * Universal entity table for posts, pages, and projects.
 * Replaces markdown content layer + postsMeta after migration (Plan 2).
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    lang: postLang("lang").notNull(),
    kind: postKind("kind").notNull().default("post"),
    status: postStatus("status").notNull().default("draft"),

    title: text("title").notNull(),
    description: text("description").notNull(),
    summary: text("summary"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    faq: jsonb("faq").$type<{ question: string; answer: string }[] | null>(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    cover: text("cover"),
    coverAlt: text("cover_alt"),
    author: text("author").notNull().default("Артём"),
    pubDate: timestamp("pub_date", { withTimezone: true }).notNull(),
    updatedDate: timestamp("updated_date", { withTimezone: true }),
    extra: jsonb("extra").notNull().default(sql`'{}'::jsonb`),

    bodyMd: text("body_md").notNull(),
    bodyHtml: text("body_html"),
    toc: jsonb("toc").$type<{ slug: string; depth: number; text: string }[] | null>(),
    renderVersion: integer("render_version").notNull().default(0),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),

    sourceHash: text("source_hash"),
    manuallyEdited: boolean("manually_edited").notNull().default(false),

    displayOrder: integer("display_order").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),

    searchVector: tsvector("search_vector"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLangUx: uniqueIndex("posts_slug_lang_ux").on(t.slug, t.lang),
    publishedIdx: index("posts_published_idx")
      .on(t.lang, t.pubDate)
      .where(sql`status = 'published'`),
    searchIdx: index("posts_search_idx").using("gin", t.searchVector),
    tagsIdx: index("posts_tags_idx").using("gin", t.tags),
    kindStatusIdx: index("posts_kind_status_idx").on(t.kind, t.status, t.lang),
  }),
);
```

- [ ] **Step 4: Append `agentJobs` table**

```typescript
/**
 * Single queue for all agent work. Workers claim via FOR UPDATE SKIP LOCKED.
 * pg_notify('agent_jobs_pending') wakes workers on INSERT.
 */
export const agentJobs = pgTable(
  "agent_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: agentJobStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index("agent_jobs_pending_idx")
      .on(t.priority, t.runAfter, t.createdAt)
      .where(sql`status = 'pending'`),
    kindIdx: index("agent_jobs_kind_idx").on(t.kind, t.createdAt),
    idempotencyUx: uniqueIndex("agent_jobs_idempotency_ux").on(t.kind, t.idempotencyKey),
  }),
);
```

- [ ] **Step 5: Append `agentRuns` table**

```typescript
/**
 * Execution traces — one row per attempt. Captures tokens, cost, LangSmith link.
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => agentJobs.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    langgraphThreadId: text("langgraph_thread_id"),
    langsmithTraceId: text("langsmith_trace_id"),
    status: agentRunStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    modelCalls: integer("model_calls").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    error: jsonb("error"),
    finalOutput: jsonb("final_output"),
  },
  (t) => ({
    jobAttemptUx: uniqueIndex("agent_runs_job_attempt_ux").on(t.jobId, t.attempt),
    traceIdx: index("agent_runs_trace_idx").on(t.langsmithTraceId),
  }),
);
```

- [ ] **Step 6: Append `agentArtifacts` table**

```typescript
/**
 * Outputs from a run — drafts, translations, social drafts, rss seeds, etc.
 * `kind` discriminates the shape of `content`. Validation happens at write site.
 */
export const agentArtifacts = pgTable(
  "agent_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refTable: text("ref_table"),
    refId: text("ref_id"),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("agent_artifacts_kind_idx").on(t.kind, t.createdAt),
    refIdx: index("agent_artifacts_ref_idx").on(t.refTable, t.refId),
  }),
);
```

- [ ] **Step 7: Append `agentEvents` table (для SSE replay)**

```typescript
/**
 * Append-only event log for SSE replay. Hono streams new rows via LISTEN
 * and serves missed events on reconnect via `Last-Event-ID` header.
 */
export const agentEvents = pgTable(
  "agent_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    type: text("type").notNull(), // 'job.created' | 'job.updated' | 'run.started' | 'run.tokens' | 'run.finished'
    jobId: uuid("job_id"),
    runId: uuid("run_id"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("agent_events_created_idx").on(t.createdAt),
    jobIdx: index("agent_events_job_idx").on(t.jobId),
  }),
);
```

- [ ] **Step 8: Append type aliases**

В конец файла:

```typescript
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type AgentJob = typeof agentJobs.$inferSelect;
export type NewAgentJob = typeof agentJobs.$inferInsert;

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

export type AgentArtifact = typeof agentArtifacts.$inferSelect;
export type NewAgentArtifact = typeof agentArtifacts.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
```

- [ ] **Step 9: Generate migration**

```bash
cd /Users/izual/astro-blog
pnpm db:generate
```

Expected: создан файл `drizzle/0006_*.sql`. Открыть и проверить — должны быть `CREATE TYPE post_kind AS ENUM (...)`, `CREATE TABLE posts (...)`, `CREATE TABLE agent_jobs (...)`, и индексы.

- [ ] **Step 10: Inspect generated SQL**

Read: `/Users/izual/astro-blog/drizzle/0006_*.sql`

Verify:
- Все 5 новых таблиц созданы
- Никакие существующие таблицы не модифицированы (`postsMeta`, `postRevisions`, `socialPosts`, etc. остаются)
- Нет `DROP` statement'ов

Если drizzle сгенерировал лишнее — отредактировать руками (drizzle-kit известна проблема с false-positive diffs). Конкретно: убрать любые `ALTER TABLE` для существующих таблиц.

- [ ] **Step 11: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0006_*.sql drizzle/meta/
git commit -m "feat(db): add posts/agent_jobs/agent_runs/agent_artifacts/agent_events tables"
```

---

## Task 5: SQL triggers and Postgres roles migration

Создаём manual SQL миграцию (drizzle-kit не умеет генерировать триггеры и GRANT'ы).

**Files:**
- Create: `drizzle/0007_triggers_and_roles.sql`
- Create: `drizzle/0007_triggers_and_roles_rollback.sql`

- [ ] **Step 1: Create `drizzle/0007_triggers_and_roles.sql`**

Path: `/Users/izual/astro-blog/drizzle/0007_triggers_and_roles.sql`

```sql
-- Triggers and Postgres roles for refactor v2.
-- Idempotent where possible (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS).

-- ── 1. search_vector update on posts ──────────────────────────────────

CREATE OR REPLACE FUNCTION posts_update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_md, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_search_vector_tg ON posts;
CREATE TRIGGER posts_search_vector_tg
BEFORE INSERT OR UPDATE OF title, description, summary, body_md, tags
ON posts FOR EACH ROW EXECUTE FUNCTION posts_update_search_vector();

-- ── 2. updated_at autobump on posts ───────────────────────────────────

CREATE OR REPLACE FUNCTION posts_bump_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_updated_at_tg ON posts;
CREATE TRIGGER posts_updated_at_tg
BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION posts_bump_updated_at();

-- ── 3. agent_jobs pg_notify on pending insert/update ──────────────────

CREATE OR REPLACE FUNCTION agent_jobs_notify_pending() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM pg_notify(
      'agent_jobs_pending',
      json_build_object('id', NEW.id, 'kind', NEW.kind)::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_notify_pending_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_notify_pending_tg
AFTER INSERT OR UPDATE OF status, run_after ON agent_jobs
FOR EACH ROW EXECUTE FUNCTION agent_jobs_notify_pending();

-- ── 4. agent_jobs updated_at autobump ─────────────────────────────────

CREATE OR REPLACE FUNCTION agent_jobs_bump_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_updated_at_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_updated_at_tg
BEFORE UPDATE ON agent_jobs FOR EACH ROW EXECUTE FUNCTION agent_jobs_bump_updated_at();

-- ── 5. agent_events emitter — fan-in для SSE ──────────────────────────

CREATE OR REPLACE FUNCTION agent_jobs_emit_event() RETURNS trigger AS $$
DECLARE
  evt_type text;
  evt_payload jsonb;
  new_event_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt_type := 'job.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.attempts IS DISTINCT FROM OLD.attempts
        OR NEW.last_error IS DISTINCT FROM OLD.last_error THEN
    evt_type := 'job.updated';
  ELSE
    RETURN NEW;
  END IF;
  evt_payload := jsonb_build_object(
    'id', NEW.id,
    'kind', NEW.kind,
    'status', NEW.status,
    'attempts', NEW.attempts,
    'last_error', NEW.last_error,
    'finished_at', NEW.finished_at
  );
  INSERT INTO agent_events (type, job_id, payload)
    VALUES (evt_type, NEW.id, evt_payload)
    RETURNING id INTO new_event_id;
  PERFORM pg_notify(
    'agent_event',
    json_build_object('event_id', new_event_id, 'type', evt_type, 'job_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_emit_event_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_emit_event_tg
AFTER INSERT OR UPDATE ON agent_jobs
FOR EACH ROW EXECUTE FUNCTION agent_jobs_emit_event();

CREATE OR REPLACE FUNCTION agent_runs_emit_event() RETURNS trigger AS $$
DECLARE
  evt_type text;
  evt_payload jsonb;
  new_event_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt_type := 'run.started';
  ELSIF NEW.status = 'completed' AND OLD.status = 'running' THEN
    evt_type := 'run.finished';
  ELSIF NEW.status = 'failed' AND OLD.status = 'running' THEN
    evt_type := 'run.finished';
  ELSIF NEW.input_tokens IS DISTINCT FROM OLD.input_tokens
        OR NEW.output_tokens IS DISTINCT FROM OLD.output_tokens THEN
    evt_type := 'run.tokens';
  ELSE
    RETURN NEW;
  END IF;
  evt_payload := jsonb_build_object(
    'id', NEW.id,
    'job_id', NEW.job_id,
    'status', NEW.status,
    'input_tokens', NEW.input_tokens,
    'output_tokens', NEW.output_tokens,
    'cost_usd', NEW.cost_usd,
    'finished_at', NEW.finished_at
  );
  INSERT INTO agent_events (type, job_id, run_id, payload)
    VALUES (evt_type, NEW.job_id, NEW.id, evt_payload)
    RETURNING id INTO new_event_id;
  PERFORM pg_notify(
    'agent_event',
    json_build_object('event_id', new_event_id, 'type', evt_type, 'job_id', NEW.job_id, 'run_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_runs_emit_event_tg ON agent_runs;
CREATE TRIGGER agent_runs_emit_event_tg
AFTER INSERT OR UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION agent_runs_emit_event();

-- ── 6. agent_events retention — keep last 30 days ─────────────────────
-- Cleanup runs in agent worker as a separate job; не делаем триггер на DELETE.

-- ── 7. langgraph schema (для LangGraph checkpointer) ──────────────────

CREATE SCHEMA IF NOT EXISTS langgraph;

-- ── 8. Postgres role separation ───────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer LOGIN PASSWORD 'app_writer_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
    CREATE ROLE app_reader LOGIN PASSWORD 'app_reader_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'render_reader') THEN
    CREATE ROLE render_reader LOGIN PASSWORD 'render_reader_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_writer') THEN
    CREATE ROLE agent_writer LOGIN PASSWORD 'agent_writer_pw';
  END IF;
END $$;

-- app_writer: full access to public schema (Hono API)
GRANT USAGE ON SCHEMA public TO app_writer;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_writer;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_writer;

-- app_reader: read-only public schema (Astro frontend)
GRANT USAGE ON SCHEMA public TO app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_reader;

-- render_reader: read posts (для render-service)
GRANT USAGE ON SCHEMA public TO render_reader;
GRANT SELECT ON posts TO render_reader;

-- agent_writer: agent_* tables full + posts write + media_assets read + langgraph schema full
GRANT USAGE ON SCHEMA public TO agent_writer;
GRANT SELECT, INSERT, UPDATE ON posts TO agent_writer;
GRANT SELECT ON media_assets TO agent_writer;
GRANT ALL ON agent_jobs, agent_runs, agent_artifacts, agent_events TO agent_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO agent_writer;
GRANT USAGE, CREATE ON SCHEMA langgraph TO agent_writer;
GRANT ALL ON ALL TABLES IN SCHEMA langgraph TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph GRANT ALL ON TABLES TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph GRANT ALL ON SEQUENCES TO agent_writer;

-- Explicit denies (NOT-grant): agent_writer не может читать sessions/accounts/verifications
REVOKE ALL ON sessions, accounts, verifications, users FROM agent_writer;
GRANT SELECT (id, email, name) ON users TO agent_writer; -- только для FK lookup
```

**Замечания по паролям:** в реальности пароли должны быть в env vars, не в миграции. Эта миграция применяется один раз на dev/staging; для prod — заменить пароли через `ALTER ROLE ... PASSWORD ...` после первого apply. Документировать в `infra/postgres-roles.md` (создаём в Step 3).

- [ ] **Step 2: Create rollback migration**

Path: `/Users/izual/astro-blog/drizzle/0007_triggers_and_roles_rollback.sql`

```sql
-- Rollback for 0007. Apply manually if needed.

DROP TRIGGER IF EXISTS posts_search_vector_tg ON posts;
DROP TRIGGER IF EXISTS posts_updated_at_tg ON posts;
DROP TRIGGER IF EXISTS agent_jobs_notify_pending_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_jobs_updated_at_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_jobs_emit_event_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_runs_emit_event_tg ON agent_runs;

DROP FUNCTION IF EXISTS posts_update_search_vector();
DROP FUNCTION IF EXISTS posts_bump_updated_at();
DROP FUNCTION IF EXISTS agent_jobs_notify_pending();
DROP FUNCTION IF EXISTS agent_jobs_bump_updated_at();
DROP FUNCTION IF EXISTS agent_jobs_emit_event();
DROP FUNCTION IF EXISTS agent_runs_emit_event();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_writer, app_reader, render_reader, agent_writer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_writer, agent_writer;
REVOKE ALL ON SCHEMA public FROM app_writer, app_reader, render_reader, agent_writer;
REVOKE ALL ON SCHEMA langgraph FROM agent_writer;

DROP SCHEMA IF EXISTS langgraph CASCADE;

DROP ROLE IF EXISTS app_writer;
DROP ROLE IF EXISTS app_reader;
DROP ROLE IF EXISTS render_reader;
DROP ROLE IF EXISTS agent_writer;
```

- [ ] **Step 3: Create `infra/postgres-roles.md`**

Path: `/Users/izual/astro-blog/infra/postgres-roles.md`

```markdown
# Postgres roles

Created by `drizzle/0007_triggers_and_roles.sql`.

| Role | Used by | Grants |
|---|---|---|
| `app_writer` | Hono API (`@artka/api`) | full RW on public schema |
| `app_reader` | Astro frontend | SELECT on public schema |
| `render_reader` | Render service | SELECT on posts only |
| `agent_writer` | Python agent service | full on agent_*, posts RW, media_assets R, langgraph schema full. NO access to sessions/accounts/verifications. |

## Setting passwords

Default passwords in the migration are placeholders. After first apply on a real environment:

\`\`\`sql
ALTER ROLE app_writer PASSWORD '<secure-random>';
ALTER ROLE app_reader PASSWORD '<secure-random>';
ALTER ROLE render_reader PASSWORD '<secure-random>';
ALTER ROLE agent_writer PASSWORD '<secure-random>';
\`\`\`

Store the resulting `DATABASE_URL` per service in `.env.<service>` files (gitignored).
```

- [ ] **Step 4: Commit**

```bash
git add drizzle/0007_triggers_and_roles.sql drizzle/0007_triggers_and_roles_rollback.sql infra/postgres-roles.md
git commit -m "feat(db): add triggers (search_vector, pg_notify) and Postgres role separation"
```

---

## Task 6: Update migration script to apply manual SQL

Текущий `db:migrate` использует drizzle migrator который не подхватывает manual SQL files без специальной структуры. Нужно расширить.

**Files:**
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Read current migrator**

Read: `/Users/izual/astro-blog/src/lib/db/migrate.ts`

- [ ] **Step 2: Extend to apply manual SQL files**

В конце текущего `migrate.ts`, после `await migrate(...)`, добавить:

```typescript
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Apply manual SQL migrations (триггеры, roles) — drizzle-kit их не генерирует.
// Convention: файлы вида `<NNNN>_<name>.sql` в drizzle/, БЕЗ соответствующего записи в drizzle/meta/.
// Идемпотентность — обязанность самого SQL (CREATE OR REPLACE, DROP IF EXISTS).
const drizzleDir = path.resolve(process.cwd(), "drizzle");
const manualMigrations = ["0007_triggers_and_roles.sql"]; // append more as added
for (const file of manualMigrations) {
  const sqlPath = path.join(drizzleDir, file);
  const sql = await readFile(sqlPath, "utf-8");
  console.log(`[migrate] applying manual SQL: ${file}`);
  await db.execute(sql);
}
```

(Точная локация import'ов и переменной `db` — следовать существующей структуре файла.)

- [ ] **Step 3: Run migration**

```bash
cd /Users/izual/astro-blog
docker compose up -d postgres
sleep 3
DATABASE_URL=postgresql://blog:blog@localhost:5432/blog pnpm db:migrate
```

Expected:
- Drizzle применяет `0006_*.sql` → создаются новые таблицы
- Manual migrator применяет `0007_*.sql` → создаются triggers, schema langgraph, roles

- [ ] **Step 4: Verify schema**

```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "\dt"
```

Expected output должен включать: `posts`, `agent_jobs`, `agent_runs`, `agent_artifacts`, `agent_events` (плюс старые таблицы).

```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "\dn"
```

Expected: `langgraph` schema присутствует.

```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "\du"
```

Expected: roles `app_writer`, `app_reader`, `render_reader`, `agent_writer` созданы.

- [ ] **Step 5: Verify pg_notify works**

В одном терминале:
```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "LISTEN agent_jobs_pending; SELECT pg_sleep(60);"
```

В другом терминале:
```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "INSERT INTO users (id, email, name, email_verified, role) VALUES (gen_random_uuid(), 'test@test', 'test', false, 'admin') RETURNING id;"
```

Сохранить полученный uuid. Затем:
```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "INSERT INTO agent_jobs (kind, payload, created_by_id) VALUES ('test_kind', '{}'::jsonb, '<uuid_from_above>');"
```

Expected в первом терминале: получено notification на канале `agent_jobs_pending` с payload `{"id": "...", "kind": "test_kind"}`.

- [ ] **Step 6: Verify agent_events emission**

```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "SELECT * FROM agent_events;"
```

Expected: один row с `type='job.created'`.

- [ ] **Step 7: Cleanup test data**

```bash
docker exec -it astro-blog-postgres psql -U blog -d blog -c "DELETE FROM agent_events; DELETE FROM agent_jobs; DELETE FROM users WHERE email='test@test';"
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/migrate.ts
git commit -m "feat(db): apply manual SQL migrations after drizzle-kit migrate"
```

---

## Task 7: docker-compose updates

Добавляем все новые сервисы в compose, причём stub-режим — каждый отвечает healthcheck'ом.

**Files:**
- Modify: `docker-compose.yml`
- Create: `infra/Caddyfile`
- Create: `infra/docker-compose.dev.yml` (для локальной разработки без Caddy)

- [ ] **Step 1: Replace `docker-compose.yml`**

Path: `/Users/izual/astro-blog/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:18-bookworm
    container_name: astro-blog-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: blog
      POSTGRES_PASSWORD: blog
      POSTGRES_DB: blog
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "blog", "-d", "blog"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    container_name: astro-blog-api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://app_writer:app_writer_pw@postgres:5432/blog
      PORT: "3001"
      RENDER_SERVICE_URL: http://render:3002
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  render:
    build:
      context: .
      dockerfile: render/Dockerfile
    container_name: astro-blog-render
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://render_reader:render_reader_pw@postgres:5432/blog
      PORT: "3002"
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3002"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  agents:
    build:
      context: ./agents
      dockerfile: Dockerfile
    container_name: astro-blog-agents
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://agent_writer:agent_writer_pw@postgres:5432/blog
      LANGGRAPH_PG_SCHEMA: langgraph
      PORT: "8000"
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "8000"

  admin:
    build:
      context: .
      dockerfile: admin/Dockerfile
    container_name: astro-blog-admin
    restart: unless-stopped
    expose:
      - "80"

  caddy:
    image: caddy:2-alpine
    container_name: astro-blog-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      api:
        condition: service_healthy
      admin:
        condition: service_started

volumes:
  postgres-data:
  caddy-data:
  caddy-config:
```

Note: `astro-blog` (фронтенд) пока в этот compose не добавляем — он живёт как и раньше через root Dockerfile + Dokploy. Заменим в Plan 2.

- [ ] **Step 2: Create `infra/Caddyfile`**

Path: `/Users/izual/astro-blog/infra/Caddyfile`

```caddy
{
    # Email для Let's Encrypt
    email dev@artka.dev
}

api.artka.dev {
    reverse_proxy api:3001 {
        flush_interval -1
    }
}

admin.artka.dev {
    reverse_proxy admin:80
}

# artka.dev раздаётся отдельным контейнером (текущая Astro setup), не входит в этот compose.
```

- [ ] **Step 3: Create `infra/docker-compose.dev.yml`**

Path: `/Users/izual/astro-blog/infra/docker-compose.dev.yml`

Override для локальной разработки — без Caddy, прямые ports.

```yaml
# Apply with: docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d
services:
  caddy:
    profiles: ["disabled"]

  api:
    ports:
      - "3001:3001"

  render:
    ports:
      - "3002:3002"

  agents:
    ports:
      - "8000:8000"

  admin:
    ports:
      - "8080:80"
```

- [ ] **Step 4: Build all services**

```bash
cd /Users/izual/astro-blog
docker compose build
```

Expected: api, render, admin, agents — каждый build успешен. Это **долго** (5-10 минут на первый раз).

- [ ] **Step 5: Start in dev mode (without Caddy)**

```bash
cd /Users/izual/astro-blog
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d postgres api render admin agents
```

Wait 30 seconds:
```bash
sleep 30
docker compose ps
```

Expected: все сервисы `healthy` (или `running` для agents — у Python нет explicit healthcheck в docker; Step 6 проверит curl'ом).

- [ ] **Step 6: Verify each service healthcheck**

```bash
curl -fsS http://localhost:3001/health
# expected: {"status":"ok","service":"api","version":"dev"}

curl -fsS http://localhost:3002/health
# expected: {"status":"ok","service":"render"}

curl -fsS http://localhost:8000/health
# expected: {"status":"ok","service":"agents"}

curl -fsS http://localhost:8080/health
# expected: ok
```

Если что-то падает — проверить `docker compose logs <service>`.

- [ ] **Step 7: Verify Caddy starts (build prod compose)**

```bash
docker compose down
docker compose up -d
docker compose ps caddy
docker compose logs caddy | tail -20
```

Expected: Caddy starts, без ошибок (failed на TLS — норма локально без DNS, главное что процесс запустился).

```bash
docker compose down
```

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml infra/Caddyfile infra/docker-compose.dev.yml
git commit -m "feat(infra): docker-compose with api/render/admin/agents/caddy stubs"
```

---

## Task 8: GitHub Actions paths-filter workflows

Один workflow на сервис, билд + push в ghcr только если изменились соответствующие файлы.

**Files:**
- Create: `.github/workflows/docker-publish-api.yml`
- Create: `.github/workflows/docker-publish-render.yml`
- Create: `.github/workflows/docker-publish-admin.yml`
- Create: `.github/workflows/docker-publish-agents.yml`

- [ ] **Step 1: Read existing publish workflow as template**

```bash
ls .github/workflows/
cat .github/workflows/docker-publish.yml
```

Сохранить структуру (auth, registry, tags) — в новых workflows используем тот же паттерн.

- [ ] **Step 2: Create `docker-publish-api.yml`**

Path: `/Users/izual/astro-blog/.github/workflows/docker-publish-api.yml`

```yaml
name: docker-publish-api

on:
  push:
    branches: [main]
    paths:
      - "api/**"
      - "packages/shared/**"
      - "pnpm-lock.yaml"
      - "pnpm-workspace.yaml"
      - ".github/workflows/docker-publish-api.yml"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/artka-api
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: api/Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,scope=api,mode=max
          build-args: |
            GIT_SHA=${{ github.sha }}
```

- [ ] **Step 3: Create `docker-publish-render.yml`**

Path: `/Users/izual/astro-blog/.github/workflows/docker-publish-render.yml`

Same as Step 2 with substitutions:
- `paths` — `render/**`, `packages/shared/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/docker-publish-render.yml`
- image — `artka-render`
- file — `render/Dockerfile`
- cache scope — `render`

```yaml
name: docker-publish-render

on:
  push:
    branches: [main]
    paths:
      - "render/**"
      - "pnpm-lock.yaml"
      - "pnpm-workspace.yaml"
      - ".github/workflows/docker-publish-render.yml"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/artka-render
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: render/Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=render
          cache-to: type=gha,scope=render,mode=max
```

- [ ] **Step 4: Create `docker-publish-admin.yml`**

Path: `/Users/izual/astro-blog/.github/workflows/docker-publish-admin.yml`

```yaml
name: docker-publish-admin

on:
  push:
    branches: [main]
    paths:
      - "admin/**"
      - "packages/shared/**"
      - "pnpm-lock.yaml"
      - "pnpm-workspace.yaml"
      - ".github/workflows/docker-publish-admin.yml"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/artka-admin
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: admin/Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=admin
          cache-to: type=gha,scope=admin,mode=max
```

- [ ] **Step 5: Create `docker-publish-agents.yml`**

Path: `/Users/izual/astro-blog/.github/workflows/docker-publish-agents.yml`

```yaml
name: docker-publish-agents

on:
  push:
    branches: [main]
    paths:
      - "agents/**"
      - ".github/workflows/docker-publish-agents.yml"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/artka-agents
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: ./agents
          file: agents/Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=agents
          cache-to: type=gha,scope=agents,mode=max
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/docker-publish-*.yml
git commit -m "ci: add per-service docker publish workflows with paths-filter"
```

---

## Task 9: Pg_notify integration test (Vitest + testcontainers)

Доказываем, что триггеры работают: INSERT в agent_jobs → notification, INSERT/UPDATE в agent_runs → запись в agent_events.

**Files:**
- Create: `src/lib/db/__tests__/triggers.test.ts`

- [ ] **Step 1: Check vitest setup uses testcontainers or external db**

Read: `/Users/izual/astro-blog/vitest.config.ts` (или vite.config / vitest.workspace).
Read: `/Users/izual/astro-blog/src/lib/db/__tests__/` (если существует — посмотреть, как тесты сейчас подключаются к БД).

Если в проекте уже есть pattern для DB tests (через `getViteConfig()` from astro + testcontainers или local docker postgres) — используем его. Если нет — пишем минимальный пример с `pg` client напрямую к `localhost:5432`.

- [ ] **Step 2: Write triggers test**

Path: `/Users/izual/astro-blog/src/lib/db/__tests__/triggers.test.ts`

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://blog:blog@localhost:5432/blog";

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
let testUserId: string;

beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (id, email, name, email_verified, role)
    VALUES (gen_random_uuid(), 'triggers-test@artka.dev', 'triggers-test', false, 'admin')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  testUserId = user.id;
});

afterAll(async () => {
  await sql`DELETE FROM agent_artifacts WHERE 1=1`;
  await sql`DELETE FROM agent_runs WHERE 1=1`;
  await sql`DELETE FROM agent_jobs WHERE created_by_id = ${testUserId}`;
  await sql`DELETE FROM agent_events WHERE 1=1`;
  await sql`DELETE FROM users WHERE email = 'triggers-test@artka.dev'`;
  await sql.end();
});

describe("agent_jobs triggers", () => {
  it("INSERT pending → pg_notify on agent_jobs_pending channel", async () => {
    const listenSql = postgres(DATABASE_URL, { max: 1 });
    const received: { id: string; kind: string }[] = [];
    await listenSql.listen("agent_jobs_pending", (payload) => {
      received.push(JSON.parse(payload));
    });

    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_kind', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await new Promise((r) => setTimeout(r, 200));
    await listenSql.end();

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe(job.id);
    expect(received[0]?.kind).toBe("test_kind");
  });

  it("INSERT into agent_jobs creates job.created event", async () => {
    const before = (await sql<{ count: bigint }[]>`
      SELECT count(*) AS count FROM agent_events WHERE type = 'job.created'
    `)[0]!.count;

    await sql`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_event_emit', '{}'::jsonb, ${testUserId})
    `;

    const after = (await sql<{ count: bigint }[]>`
      SELECT count(*) AS count FROM agent_events WHERE type = 'job.created'
    `)[0]!.count;

    expect(after - before).toBe(1n);
  });

  it("UPDATE agent_jobs status → job.updated event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_update', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await sql`
      UPDATE agent_jobs SET status = 'running' WHERE id = ${job.id}
    `;

    const events = await sql<{ type: string }[]>`
      SELECT type FROM agent_events WHERE job_id = ${job.id} ORDER BY id
    `;
    expect(events.map((e) => e.type)).toEqual(["job.created", "job.updated"]);
  });
});

describe("agent_runs triggers", () => {
  it("INSERT agent_run → run.started event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_run', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await sql`
      INSERT INTO agent_runs (job_id, attempt, status)
      VALUES (${job.id}, 1, 'running')
    `;

    const [evt] = await sql<{ type: string }[]>`
      SELECT type FROM agent_events
      WHERE job_id = ${job.id} AND type = 'run.started'
      LIMIT 1
    `;
    expect(evt?.type).toBe("run.started");
  });

  it("UPDATE agent_run tokens → run.tokens event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_tokens', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;
    const [run] = await sql<{ id: string }[]>`
      INSERT INTO agent_runs (job_id, attempt, status)
      VALUES (${job.id}, 1, 'running')
      RETURNING id
    `;

    await sql`
      UPDATE agent_runs SET input_tokens = 100, output_tokens = 50 WHERE id = ${run.id}
    `;

    const [evt] = await sql<{ payload: { input_tokens: number; output_tokens: number } }[]>`
      SELECT payload FROM agent_events
      WHERE run_id = ${run.id} AND type = 'run.tokens'
      LIMIT 1
    `;
    expect(evt?.payload.input_tokens).toBe(100);
    expect(evt?.payload.output_tokens).toBe(50);
  });
});

describe("posts triggers", () => {
  it("INSERT posts → search_vector populated", async () => {
    const [post] = await sql<{ search_vector: string | null }[]>`
      INSERT INTO posts (slug, lang, title, description, body_md, pub_date)
      VALUES ('test-trigger', 'ru', 'Test Title Karpathy', 'Some Description', 'Body text here', now())
      RETURNING search_vector::text
    `;
    expect(post?.search_vector).toBeTruthy();
    expect(post?.search_vector).toContain("karpathy");

    await sql`DELETE FROM posts WHERE slug = 'test-trigger' AND lang = 'ru'`;
  });

  it("UPDATE posts → updated_at bumps", async () => {
    const [created] = await sql<{ id: string; updated_at: Date }[]>`
      INSERT INTO posts (slug, lang, title, description, body_md, pub_date)
      VALUES ('test-bump', 'ru', 't', 'd', 'b', now())
      RETURNING id, updated_at
    `;

    await new Promise((r) => setTimeout(r, 50));

    const [updated] = await sql<{ updated_at: Date }[]>`
      UPDATE posts SET title = 'changed' WHERE id = ${created.id}
      RETURNING updated_at
    `;

    expect(updated.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    await sql`DELETE FROM posts WHERE id = ${created.id}`;
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
docker compose up -d postgres
sleep 2
TEST_DATABASE_URL=postgresql://blog:blog@localhost:5432/blog pnpm test src/lib/db/__tests__/triggers.test.ts
```

Expected: все 7 тестов проходят.

Если падает — наиболее вероятные причины:
- Миграция 0007 не применена → `pnpm db:migrate` ещё раз
- `postgres.js` не установлен в root package.json — он должен быть, проверить `package.json` (используется существующим кодом)
- Test isolation — между тестами есть data leak; добавить cleanup в `beforeEach` если нужно

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/__tests__/triggers.test.ts
git commit -m "test(db): integration tests for pg_notify and event-emit triggers"
```

---

## Task 10: README updates

**Files:**
- Modify: `README.md`
- Create: `infra/README.md`

- [ ] **Step 1: Append to root README.md**

В существующий `/Users/izual/astro-blog/README.md` (приложить, не заменять; точная вставка зависит от текущей структуры — добавить раздел "Workspace structure" после описания проекта).

```markdown
## Workspace structure (refactor v2 in progress)

This repo is a pnpm monorepo undergoing migration from Astro-monolith to multi-service architecture (see `docs/superpowers/specs/2026-05-10-postgres-cms-agents-design.md`).

Services after refactor:
- `.` (root) — Astro frontend (will become read-only after Plan 2)
- `api/` — Hono API server (`@artka/api`)
- `render/` — Markdown→HTML render service (`@artka/render`)
- `admin/` — React SPA admin (`@artka/admin`)
- `agents/` — Python agent service (`artka-agents`, FastAPI + LangGraph)
- `packages/shared/` — Zod schemas + TS types shared between TS services

Run all services locally:
\`\`\`bash
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d
\`\`\`

Postgres roles documented in `infra/postgres-roles.md`.
```

- [ ] **Step 2: Create `infra/README.md`**

Path: `/Users/izual/astro-blog/infra/README.md`

```markdown
# Infrastructure

## Files

- `Caddyfile` — reverse proxy for prod (api.artka.dev, admin.artka.dev)
- `docker-compose.dev.yml` — overlay для локальной разработки (отключает Caddy, открывает порты наружу)
- `postgres-roles.md` — описание ролей Postgres и их grants

## Local dev

\`\`\`bash
# All services with direct ports (no Caddy)
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d

# Verify
curl localhost:3001/health  # api
curl localhost:3002/health  # render
curl localhost:8000/health  # agents
curl localhost:8080/health  # admin (nginx)
\`\`\`

## Prod-like (Caddy)

\`\`\`bash
docker compose up -d
# requires DNS for api.artka.dev / admin.artka.dev to point to host
\`\`\`
```

- [ ] **Step 3: Commit**

```bash
git add README.md infra/README.md
git commit -m "docs: workspace structure and infra readme"
```

---

## Task 11: Final verification — Done condition for Plan 1

Spec done condition (Phase 0 + 1):
- ✅ docker-compose up даёт зелёные healthcheck'и для postgres, hono, render, agents (заглушки), admin
- ✅ Caddy раздаёт 3 поддомена с TLS (локально без DNS — но процесс стартует)
- ✅ GH Actions paths-filter билдит правильный image (workflows есть, проверим на push в Step 4)
- ✅ `pnpm db:migrate` идемпотентен. `pg_notify('agent_jobs_pending')` срабатывает при INSERT (Task 9 тесты)
- ✅ Postgres roles созданы, grants выданы (Task 5, verified в Task 6)
- ✅ Rollback миграция reverts чисто (rollback скрипт есть, но не применяется автоматически)

- [ ] **Step 1: Clean rebuild and verification**

```bash
cd /Users/izual/astro-blog
docker compose down -v  # CAREFUL: deletes postgres data
docker compose up -d postgres
sleep 5
DATABASE_URL=postgresql://blog:blog@localhost:5432/blog pnpm db:migrate
docker compose -f docker-compose.yml -f infra/docker-compose.dev.yml up -d
sleep 30
docker compose ps
```

Expected: `postgres healthy`, `api healthy`, `render healthy`, `admin running`, `agents running`.

- [ ] **Step 2: Run integration tests**

```bash
TEST_DATABASE_URL=postgresql://blog:blog@localhost:5432/blog pnpm test src/lib/db/__tests__/triggers.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 3: Verify rollback works**

```bash
docker exec -i astro-blog-postgres psql -U blog -d blog -f /dev/stdin < drizzle/0007_triggers_and_roles_rollback.sql
docker exec -it astro-blog-postgres psql -U blog -d blog -c "\du"
```

Expected: roles `app_writer`, `app_reader`, `render_reader`, `agent_writer` отсутствуют.

Re-apply forward:
```bash
DATABASE_URL=postgresql://blog:blog@localhost:5432/blog pnpm db:migrate
```

Expected: idempotent — applies cleanly, тесты снова проходят.

- [ ] **Step 4: Push branch and verify GH Actions**

```bash
git checkout -b refactor/postgres-cms-agents
git push -u origin refactor/postgres-cms-agents
gh pr create --title "refactor/postgres-cms-agents: foundation + schema (Plan 1/6)" --body "$(cat <<'EOF'
## Summary
- pnpm workspace structure (api/render/admin/agents/packages/shared)
- New Postgres tables: posts, agent_jobs, agent_runs, agent_artifacts, agent_events
- Triggers: search_vector update, pg_notify on agent_jobs, event emission to agent_events
- Postgres roles separation: app_reader/app_writer/render_reader/agent_writer
- LangGraph schema isolated as `langgraph`
- Stub healthcheck endpoints for new services
- Caddy reverse proxy config
- GH Actions paths-filter workflows

Plan: \`docs/superpowers/plans/2026-05-10-plan-1-foundation-schema.md\`
Spec: \`docs/superpowers/specs/2026-05-10-postgres-cms-agents-design.md\`

## Test plan
- [ ] \`docker compose up\` зелёный
- [ ] \`pnpm test src/lib/db/__tests__/triggers.test.ts\` 7/7 passes
- [ ] Rollback migration applies cleanly
- [ ] GH Actions docker-publish-* workflows pass on push
EOF
)"
```

Expected:
- PR создан
- В Actions tab — четыре workflows запущены (api, render, admin, agents) — все pass
- Образы появляются в `https://github.com/<owner>/astro-blog/pkgs/container/...`

- [ ] **Step 5: Mark Plan 1 done**

После того как PR проходит CI и review:

```bash
git checkout main
git pull --rebase
git merge --ff-only refactor/postgres-cms-agents
git push
```

Plan 1 завершён. **Не мержим в main, пока Plan 2 не готов?** — это decision call для пользователя. Рекомендация: мержим, потому что новые таблицы coexist со старыми, никаких регрессий быть не может.

---

## Plan 1 — out of scope (next plans)

- **Plan 2** будет: миграция markdown → posts, Hono API endpoints (Better-Auth, CRUD posts), render-service реальный (rehype + Playwright), Astro переключение на чтение из БД.
- **Plan 3:** полноценный admin SPA (TanStack Router/Query, post editor с live preview, media manager).
- **Plan 4:** Python agent service полноценный — worker_loop, scheduler, draft_from_url граф, LangSmith integration, reaper.
- **Plans 5-6:** миграция translate и social pipelines в LangGraph, удаление старого TS-кода.

---

## Self-review

**Spec coverage** (Phase 0 + 1 из спека):
- [x] pnpm workspace + sub-packages — Tasks 1-3
- [x] New tables (posts, agent_jobs, agent_runs, agent_artifacts) — Task 4
- [x] agent_events для SSE replay — Task 4 Step 7
- [x] Triggers (search_vector, pg_notify, event emission) — Task 5
- [x] Postgres role separation — Task 5
- [x] LangGraph schema isolation — Task 5 Section 7
- [x] Manual SQL migration support — Task 6
- [x] docker-compose with healthchecks — Task 7
- [x] Caddyfile с flush_interval -1 для SSE — Task 7
- [x] GH Actions paths-filter — Task 8
- [x] Done condition tests (pg_notify, agent_events emission) — Task 9
- [x] Rollback verification — Task 11 Step 3

**Not covered (intentional, out of scope):**
- Render-service фактически рендерит — заглушка только. Реализация в Plan 2.
- Schema parity test между Drizzle и Pydantic — потребуется Plan 4 когда появятся Pydantic-модели.
- Astro fallback на disk-cache — Plan 2.

**Placeholder scan:** Просмотрено — нет TBD/TODO/«implement later». Все шаги имеют exact code/commands.

**Type consistency:** Drizzle schema names согласованы между schema.ts и SQL триггерами (`agent_jobs_pending`, `agent_event`, `posts_search_vector_tg`). NO mismatches.

**Spec requirement не покрытое:** «integration test schema parity TS↔Python» (Section 6 spec) — оставляем для Plan 4, когда появятся Pydantic-модели для теста.
