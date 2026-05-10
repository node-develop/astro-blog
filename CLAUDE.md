# Personal Blog (Astro)

Персональный сайт и блог. Статическая генерация (SSG) + динамическая админка (SSR-острова). Публикация статей в Markdown/MDX с Mermaid-диаграммами и LaTeX.

## Стек (актуально на апрель 2026)

- **Runtime:** Node.js 24 LTS
- **Язык:** TypeScript 5.9 (strict) — TS 6.0 доступен, но ломает `@astrojs/check` и `zod-to-ts`
- **Framework:** Astro 5 (SSG + on-demand rendering)
- **Package manager:** pnpm 10
- **БД:** PostgreSQL 18, драйвер `postgres.js`
- **ORM:** Drizzle ORM + drizzle-kit (schema-first в TS, миграции)
- **Auth:** Better-Auth (Lucia deprecated с 2025)
- **Валидация:** Zod 4
- **Стили:** Tailwind CSS 4 через `@tailwindcss/vite` (НЕ `@astrojs/tailwind` — deprecated)
- **MDX:** `@astrojs/mdx` 5
- **LaTeX:** `remark-math` + `rehype-katex`
- **Mermaid:** `rehype-mermaid` (build-time рендер через Playwright → SSR-safe SVG)
- **Тесты:** Vitest 3 (unit, `getViteConfig()` из Astro) + Playwright (e2e)
- **Деплой:** Docker (multi-stage, `node:24-bookworm-slim`) → GitHub Actions → ghcr.io

## Структура

```
astro-blog/
├── .claude/                  — агенты, скиллы, хуки (см. 09-subagents.md)
├── src/
│   ├── content.config.ts     — content layer (Astro 5), НЕ src/content/config.ts
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
- `pnpm typecheck` — `astro check` + `tsc --noEmit`
- `pnpm lint` — eslint + prettier
- `pnpm test` — Vitest (unit)
- `pnpm test:e2e` — Playwright
- `pnpm db:generate` — сгенерировать миграцию из schema.ts
- `pnpm db:migrate` — применить миграции
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
- Для DTO/валидации — Zod 4 схемы, типы выводим через `z.infer<>`.
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

Use the model only for decisions that code cannot make: classification, extraction, drafting, summarization, translation. Do NOT use it for routing, retries, or deterministic transformations. If a status code or a Zod schema already answers the question — code answers it. Concretely: this blog has no AI in the runtime; keep it that way.

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

Site is RU/EN. RU is the source of truth in `src/content/posts/*.md` and `src/content/site/*.md`. EN twins live under `*/en/` and are generated by `pnpm translate` (Claude Haiku 4.5, committed to git). Routing: RU at `/`, EN at `/en/` (Astro 5 i18n with `prefixDefaultLocale: false`).

When making changes to content:

- Adding/editing a RU post → run `pnpm translate` and commit the EN diff alongside RU.
- Editing UI chrome strings → edit `src/i18n/strings.ru.json`; the script will translate the changed keys via per-key hash tracking on next `pnpm translate` run.
- Hand-edited EN file → add `manuallyEdited: true` to its frontmatter to protect from regen.
- e2e fixtures → name with `e2e-*` prefix; the guard and orchestrator skip them automatically.
- CI runs `pnpm translate:check`; do not push without committing the regenerated EN files.

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
- `node:*-alpine` в Dockerfile — используем `bookworm-slim` для совместимости native-модулей.
- Не коммитим `.env`, `*.local`, `dist/`, `node_modules/`.

## Команда агентов

В `.claude/agents/` лежат субагенты для этого проекта. Вызываются через `Agent` с `subagent_type`:

- `architect` — проектирование, выбор подхода
- `sysanalyst` — требования, спеки, пользовательские сценарии
- `backender` — API, БД, auth, миграции
- `frontender` — Astro, компоненты, стили, UX
- `critic` — код-ревью, поиск проблем, anti-patterns

**Правило:** задачи на 3+ шагов сначала прогнать через `architect` → `critic`. Реализацию делит `backender` / `frontender` по домену. Финальная проверка — `critic`.

## Импорты (доп. контекст)

@docs/claude-code-guide/13-best-practices.md
@docs/claude-code-guide/12-travel-agent-blueprint.md
@docs/claude-code-guide/gitnexus.md
