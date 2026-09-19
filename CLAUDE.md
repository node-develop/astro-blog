# Personal Blog (Astro)

Персональный сайт и блог. Статическая генерация (SSG) + динамическая админка (SSR-острова). Публикация статей в Markdown/MDX с Mermaid-диаграммами и LaTeX.

## Стек (актуально на сентябрь 2026)

Единственный источник правды по версиям — этот раздел и `package.json`. Агенты и скиллы в `.claude/` не дублируют номера версий — ссылаются сюда.

- **Runtime:** Node.js 24 LTS в проде (`.nvmrc` → 24), `engines` `>=22.12 <25`
- **Язык:** TypeScript 6.0 (strict). НЕ TS 7: у него пока нет programmatic API, поэтому `@astrojs/check` и typescript-eslint на нём не работают — пересмотреть на TS 7.1+
- **Framework:** Astro 7.3 (Rust-компилятор; SSG + on-demand rendering). Markdown-пайплайн remark/rehype сохранён через `markdown.processor: unified()` из `@astrojs/markdown-remark` в `astro.config.ts`; `compressHTML: true`, `security.checkOrigin: true`
- **Package manager:** pnpm 10.34.5 (`packageManager` в `package.json`)
- **БД:** PostgreSQL 18, драйвер `postgres.js`
- **ORM:** Drizzle ORM 0.45 + drizzle-kit 0.31 (schema-first в TS, миграции); `pnpm db:migrate` = `node src/lib/db/migrate.ts` (нативный type stripping)
- **Auth:** Better-Auth 1.7 (Lucia deprecated с 2025)
- **Валидация:** Zod 4 через `astro/zod` (`astro:schema` — deprecated)
- **YAML:** js-yaml 5 только через обёртку `src/lib/yaml.ts` (YAML 1.1 schema, пустой ввод → `undefined`)
- **Стили:** Tailwind CSS 4.3 через `@tailwindcss/vite` (НЕ `@astrojs/tailwind` — deprecated)
- **MDX:** `@astrojs/mdx` 8; адаптер `@astrojs/node` 11; `@astrojs/react` 6
- **LaTeX:** `remark-math` + `rehype-katex` (katex 0.18)
- **Mermaid:** `rehype-mermaid` (build-time рендер через Playwright → SSR-safe SVG)
- **Подсветка кода / OG:** shiki 4, satori 0.33
- **Логи:** pino 10
- **Линт:** ESLint 10 + eslint-plugin-astro 3 + typescript-eslint 8.69, prettier
- **Тесты:** Vitest 5 (unit + integration через testcontainers, `getViteConfig()` из Astro) + Playwright 1.63 (e2e)
- **Деплой:** Docker (multi-stage, `node:24-bookworm-slim`) → GitHub Actions → ghcr.io → Dokploy (см. «Деплой» ниже)

## Структура

```
astro-blog/
├── .claude/                  — агенты, скиллы, хуки (см. 09-subagents.md)
├── src/
│   ├── content.config.ts     — content layer (Astro 5+), НЕ src/content/config.ts
│   ├── content/posts/        — *.md/*.mdx
│   ├── pages/                — SSG + динамические
│   │   ├── blog/[...slug].astro
│   │   ├── admin/            — защищено middleware
│   │   └── api/              — server endpoints
│   ├── layouts/
│   ├── components/
│   ├── lib/
│   │   ├── db/               — Drizzle schema + клиент
│   │   └── auth.ts           — Better-Auth instance
│   ├── actions/              — Astro Actions (типобезопасные форм-handlers)
│   ├── middleware.ts         — auth guard для /admin
│   └── styles/global.css     — @import "tailwindcss";
├── drizzle/                  — SQL миграции
├── Dockerfile
├── docker-compose.yml        — локальный postgres
└── .github/workflows/ci.yml
```

## Команды

- `pnpm dev` — dev-сервер на http://localhost:4321
- `pnpm build` — продакшн-билд в `dist/`
- `pnpm preview` — локальный просмотр билда
- `pnpm typecheck` — `astro sync && astro check && tsc --noEmit`
- `pnpm lint` — eslint + prettier
- `pnpm test` — Vitest (unit + integration; integration-сьюты в `tests/integration/` требуют Docker для testcontainers)
- `pnpm test:production-smoke` — smoke-тесты собранного standalone-сервера (`tests/integration/production-server.smoke.test.ts`)
- `pnpm verify:seo-build` — свежий `pnpm build` + fail-loud проверка вывода билда на известные SEO-регрессии (`scripts/verify-seo-build.ts`)
- `pnpm test:e2e` — Playwright
- `pnpm translate` — сгенерировать EN-двойники контента (см. «i18n»)
- `pnpm translate:check` — проверить, что EN-двойники актуальны (только файловая система, без API; гоняется в CI)
- `pnpm db:generate` — сгенерировать миграцию из schema.ts
- `pnpm db:migrate` — применить миграции (`node src/lib/db/migrate.ts`)
- `pnpm db:studio` — drizzle-kit studio

## Стандарты кода

### Функциональный стиль — обязательно

- **Никаких классов**, никакого `this`, никакого ООП. Только функции и чистые данные.
- Вместо классов — **функции-фабрики** или модули: `createDb(config) → db`.
- Состояние передаём явно через аргументы или context.
- Побочные эффекты — только на границах (handlers, startup).
- Иммутабельность по умолчанию: `const`, `readonly`, `Readonly<T>`. Избегаем мутаций.
- Вместо `class Service { method() }` → `function doX(deps, input)`.

### TypeScript

- `strict: true`, никаких `any` (в крайнем случае — `unknown` + narrowing).
- Для DTO/валидации — Zod 4 схемы, типы выводим через `z.infer<>`. В Astro-слое (`src/content.config.ts`, `src/actions/**`) — `import { z } from "astro/zod"`; в `src/lib/**` — прямой `import { z } from "zod"` (тот же Zod 4). `astro:schema` deprecated в Astro 7 — не использовать.
- YAML — только `import { load, dump } from "~/lib/yaml"`. Прямой `import ... from "js-yaml"` запрещён: обёртка фиксирует YAML 1.1 schema (даты во frontmatter → `Date`) и поведение на пустом вводе.
- Функции — стрелочные или named; НЕ методы на объектах.

### Astro

- Компоненты `.astro` — только вёрстка + минимум логики во frontmatter.
- Серверная логика — в `src/lib/`, `src/actions/`, `src/pages/api/`.
- Islands (React/Svelte) — только если нужна клиентская интерактивность.

### Git

- Коммиты conventional: `feat:`, `fix:`, `chore:`, `docs:`.
- Никаких `--no-verify`, никогда не пропускаем хуки.
- Секреты только в `.env` (gitignored), примеры — в `.env.example`.

## Working rules

Behavioural rules layered on top of `Стандарты кода` and `Запреты`. Each rule maps to a concrete failure mode observed in practice.

### Judgment-only

Use the model only for decisions that code cannot make: classification, extraction, drafting, summarization, translation. Do NOT use it for routing, retries, or deterministic transformations. If a status code or a Zod schema already answers the question — code answers it.

Concretely, LLM calls (`@anthropic-ai/sdk`) are allowed in exactly three places, all judgment tasks:

- `src/pages/api/check.ts` — grading answers in course challenges (`claude-haiku-4-5`).
- `src/lib/social/**` — writers → editors → critic pipeline for social drafts (via Astro Actions, behind `SOCIAL_DRAFTS_ENABLED`).
- `src/lib/translate/**` — RU→EN translation (`translate.one` action and `pnpm translate`).

Every new call site needs an explicit decision recorded in this list before it is merged. No LLM calls in routing, retries, validation, or anything a deterministic function can do. Models and prompts live next to the call site (e.g. `src/lib/social/config.ts`), never inline in handlers.

### Budgets for long-running tasks

Before any multi-step pipeline (`pnpm translate`, migrations, refactors touching ≥10 files), state the budget in the first message: "no more than N steps / M tokens". When you approach the limit, summarize what's done and start a new session with that summary. Without a budget the loop drifts and re-proposes fixes the user already rejected.

### Conflicts — pick one, do not average

When the codebase contains two patterns (e.g. two error-handling styles, two validation approaches), pick one (the newer one, or the one with more test coverage), explain the choice to the user, and flag the other for cleanup. Code that satisfies both is the worst outcome: duplicated handlers, swallowed errors.

### Read before write

Before adding code to a file, read it in full: exports, nearest callers, shared utilities. For symbols with dependencies, run `gitnexus_impact` (see `@docs/claude-code-guide/gitnexus.md`). "Looks orthogonal to me" is the most expensive sentence in the codebase — that's how you get duplicate functions and import-order winning over semantics.

### Tests verify intent, not existence

A test must fail when business logic changes. `expect(fn()).toBeDefined()` is useless when the value or side-effect is what matters. Focus Vitest unit tests and Playwright e2e on boundary conditions, observable side-effects, and user scenarios — not on "the function was called".

### Checkpoint after every significant step

Multi-step tasks (schema → migration → action → UI → tests) break silently in the middle, and subsequent steps land on top of the broken state. After each significant step, post a summary: what was done, what was verified (`pnpm typecheck`, `pnpm test`, manual check), what remains. If you lose the thread, stop and replay the state to the user.

### Match conventions

Inside this codebase, conformance beats taste. If a file's style differs from yours, follow the file. Disagreement is a separate conversation with the user, not a silent fork. Applies at the micro level (snake_case vs camelCase, `function` vs arrow where appropriate) and at the macro level (structure of `src/lib/*` modules, shape of Astro Actions).

### Fail loud

The most expensive errors are the ones that look like success. "Saved" ≠ "published"; "migration applied" ≠ "all rows updated". When uncertain, raise the question — do not hide it. Do not wrap errors in `catch {}` without logging through pino. Default to surfacing uncertainty, not masking it.

## i18n

Site is RU/EN. RU is the source of truth in `src/content/posts/*.md` and `src/content/site/*.md`. EN twins live under `*/en/` and are generated by `pnpm translate` (Claude Haiku 4.5, committed to git). Routing: RU at `/`, EN at `/en/` (built-in Astro i18n with `prefixDefaultLocale: false`).

When making changes to content:

- Adding/editing a RU post → run `pnpm translate` and commit the EN diff alongside RU.
- Editing UI chrome strings → edit `src/i18n/strings.ru.json`; the script will translate the changed keys via per-key hash tracking on next `pnpm translate` run.
- Hand-edited EN file → add `manuallyEdited: true` to its frontmatter to protect from regen.
- e2e fixtures → name with `e2e-*` prefix; the guard and orchestrator skip them automatically.
- CI runs `pnpm translate:check`; do not push without committing the regenerated EN files.
- Courses and lessons are NOT covered by `pnpm translate`: write the EN twin by hand as `src/content/courses/<course>/en/<file>.md` with `locale: en`. `pnpm translate:check` fails on a missing or orphaned twin of a course, lesson, project or site page, and `checkCounterpartExists` answers from the collections, so a page without a twin gets no hreflang and a disabled language toggle instead of advertising a 404.

Spec: `docs/superpowers/specs/2026-04-27-bilingual-ru-en-design.md`
Plan: `docs/superpowers/plans/2026-04-27-bilingual-ru-en.md`

- Entity pages: `/about`, `/now`, `/uses`, `/projects` (collection). RU markdown in `src/content/site/` and `src/content/projects/`; EN twins generated by `pnpm translate`.

Spec: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`
Plan: `docs/superpowers/plans/2026-05-02-plan-2-entity-pages.md`

## Главная страница (`/` и `/en/`)

Контент главной редактируется только через `/admin/home`. Источник истины — `src/content/site/home.md` (RU) и `src/content/site/en/home.md` (EN). 14 полей frontmatter (heroTitle, heroLede, courseTitle, authorBio, metaTitle, metaDescription, …) — см. `src/lib/content/home-schema.ts`.

- Ключи `home.*` и `meta.home.*` удалены из `strings.{ru,en}.json` — не возвращайте их. `tags.title` остаётся в strings (используется в `/tags`).
- Прямой URL `/admin/site/home` → 308 → `/admin/home`. Action `site.update` бросает `BAD_REQUEST` для slug=home — пиши через `home.update`.
- EN-сохранение в админке безусловно ставит `manuallyEdited:true` (server-side). Auto-translate из RU при `manuallyEdited:true` показывает toast «⚠️ EN защищён вручную»; для перезаписи используй кнопку ⟳ Force в PublishBar.
- `/` рендерится SSR (`prerender = false`); если потребуется снять нагрузку — переключить на SSG + `repository_dispatch` после `publish.one` (Plan B в плане ниже).
- Опциональный pre-deploy perf-чек: `pnpm build && pnpm preview` + `npx autocannon -d 30 -c 10 http://localhost:4321/`. Сравнить p95 до/после миграции.

Plan: `docs/superpowers/plans/2026-05-09-home-page-admin-editor.md`

## Запреты

- `class` / `extends` / `this` в прикладном коде.
- `@astrojs/tailwind` — deprecated, используем `@tailwindcss/vite`.
- Raw SQL в прикладном коде — только через Drizzle query builder (или явно документированная причина).
- `console.log` в prod-коде — используем pino logger (`src/lib/logger.ts`).
- `import ... from "js-yaml"` напрямую — только через `src/lib/yaml.ts`.
- `import { z } from "astro:schema"` — deprecated, используем `astro/zod`.
- Новые вызовы LLM вне трёх мест из «Judgment-only» без записи решения в этот файл.
- `node:*-alpine` в Dockerfile — используем `bookworm-slim` для совместимости native-модулей.
- Не коммитим `.env`, `*.local`, `dist/`, `node_modules/`.

## Деплой

Пуш в `main` → `.github/workflows/docker-publish.yml` → образ `ghcr.io/node-develop/astro-blog` (теги `main`, `sha-…`, `latest`, semver для `v*.*.*`) → POST на `DOKPLOY_WEBHOOK_URL` (secret) → Dokploy тянет образ и перезапускает сервис. Локальная проверка образа — скилл `deploy-check`.

- **Runtime env (обязательные в проде):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (или `SITE_URL` как fallback — `src/lib/auth.ts` падает без одного из них). Остальное — см. `.env.example`; canonical/sitemap/RSS берут `CANONICAL_ORIGIN` из `src/lib/seo/url-policy.ts`, а не env.
- **Uploads:** образ ставит `UPLOADS_DIR=/app/dist/client/uploads` — единственный путь, который и записываем, и раздаёт node-адаптер. В Dokploy на него нужен persistent volume, иначе файлы из `/admin/media` пропадают при редеплое. Runbook: `docs/runbooks/dokploy-uploads-volume.md`.
- **Одна реплика.** `docker-entrypoint.sh` при старте гоняет миграции (`scripts/migrate-prod.mjs`) и backfill (`scripts/backfill-prod.mjs`) без блокировки; два контейнера, стартующие одновременно, будут гонять их параллельно. Не масштабировать горизонтально без вынесения миграций в отдельный шаг. Ошибка миграции/backfill — fail-loud, контейнер не стартует.
- **Healthcheck:** `GET /api/version` (Dockerfile `HEALTHCHECK`); `GIT_SHA` и `BUILT_AT` прокидываются build-args.
- **Известный пробел в миграциях:** `drizzle/meta/0002_snapshot.json` отсутствует, хотя `_journal.json` содержит idx 2. Из-за этого `pnpm db:generate` может выдать ложный diff. Лечится регенерацией снапшота на машине с БД: `pnpm exec drizzle-kit check`, затем `pnpm db:generate` и ревью результата (см. `.claude/skills/db-migration/SKILL.md`). Не «чинить» руками, копируя соседний snapshot.

## Команда агентов

В `.claude/agents/` лежат субагенты для этого проекта. Вызываются через `Agent` с `subagent_type`:

- `architect` — проектирование, выбор подхода
- `sysanalyst` — требования, спеки, пользовательские сценарии
- `designer` — UI/UX-проектирование: варианты, типографика, палитра, HTML-эскизы, ревью против токенов `src/styles/tokens.css`. Не пишет код — делегирует `frontender`. Звать ПЕРЕД новым визуальным элементом
- `backender` — API, БД, auth, миграции
- `frontender` — Astro, компоненты, стили, UX
- `critic` — код-ревью, поиск проблем, anti-patterns

**Правило:** задачи на 3+ шагов сначала прогнать через `architect` → `critic`. Реализацию делит `backender` / `frontender` по домену (визуальные решения — через `designer`). Финальная проверка — `critic`.

Скиллы в `.claude/skills/` (вызов через `Skill`):

- `new-blog-post` — написать статью по источнику (URL/твит/репо) в стиле artka.dev
- `astro-component` — новый компонент в `src/components/` с типизированными props
- `design-system-tokens` — добавить/изменить токен в `src/styles/tokens.css` + `@theme`
- `ui-design-review` — чек-лист дизайн-ревью (контраст, иерархия, dark mode, a11y)
- `db-migration` — схема → `pnpm db:generate` → ревью SQL → `pnpm db:migrate`
- `deploy-check` — pre-deploy чеклист (билд, тесты, типы, docker, миграции)
- `gitnexus/*` — навигация по графу кода (exploring, impact-analysis, debugging, refactoring, cli)
- `generated/*` — авто-сгенерированные карты областей (`admin`, `content`, `e2e`, `fs`, `search`); пути в них проверять `ls` перед использованием

## Импорты (доп. контекст)

@docs/claude-code-guide/13-best-practices.md
@docs/claude-code-guide/12-travel-agent-blueprint.md
@docs/claude-code-guide/gitnexus.md
