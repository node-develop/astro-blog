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
