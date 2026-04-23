# Personal blog on Astro

Стек (апрель 2026): Astro 5, TypeScript 6 (strict), pnpm 10, PostgreSQL 18, Drizzle ORM, Better-Auth, Tailwind 4, MDX с Mermaid и KaTeX.

## Быстрый старт

```bash
# 1. зависимости
corepack enable && corepack prepare pnpm@10.12.1 --activate
pnpm install

# 2. переменные окружения
cp .env.example .env
# отредактировать .env — минимум DATABASE_URL и BETTER_AUTH_SECRET

# 3. локальный Postgres
docker compose up -d postgres

# 4. миграции
pnpm db:generate   # если менял src/lib/db/schema.ts
pnpm db:migrate

# 5. dev-сервер
pnpm dev           # http://localhost:4321
```

## Команды

| Команда            | Что делает                      |
| ------------------ | ------------------------------- |
| `pnpm dev`         | Dev-сервер                      |
| `pnpm build`       | Прод-билд в `dist/`             |
| `pnpm preview`     | Локальный просмотр прод-билда   |
| `pnpm typecheck`   | `astro check` + `tsc --noEmit`  |
| `pnpm lint`        | ESLint + Prettier check         |
| `pnpm format`      | Prettier fix                    |
| `pnpm test`        | Vitest unit                     |
| `pnpm test:e2e`    | Playwright                      |
| `pnpm db:generate` | Сгенерировать миграцию из схемы |
| `pnpm db:migrate`  | Применить миграции              |
| `pnpm db:studio`   | drizzle-kit studio              |

## Публикация статьи

1. `src/content/posts/<slug>.mdx`
2. Заполнить frontmatter (см. `src/content.config.ts`).
3. Markdown + опционально Mermaid-блоки и LaTeX (`$...$`, `$$...$$`).
4. `pnpm dev` → `http://localhost:4321/blog/<slug>`.

Подробнее — в `.claude/skills/new-blog-post/SKILL.md`.

## Деплой

Пуш в `main` запускает `.github/workflows/docker-publish.yml` → билд → пуш в `ghcr.io/<owner>/astro-blog:latest` с тегами из git.

## Claude Code

Проект настроен под Claude Code:

- `CLAUDE.md` — глобальный контекст и стандарты
- `.claude/agents/` — architect, sysanalyst, backender, frontender, critic
- `.claude/skills/` — new-blog-post, astro-component, db-migration, deploy-check
- `.claude/hooks/` — session-start, no-secrets (блокирует .env), format (prettier), notify-stop
- `.claude/settings.json` — permissions + hook registrations

## Структура репозитория

```
astro-blog/
├── .claude/                  — claude-code harness
├── .github/workflows/        — CI и публикация Docker
├── src/
│   ├── content.config.ts     — content layer схема
│   ├── content/posts/        — md/mdx статьи
│   ├── pages/                — страницы + /admin + /api
│   ├── layouts/              — Base, Post
│   ├── components/
│   ├── lib/                  — db, auth, logger
│   ├── actions/              — Astro Actions (формы)
│   ├── middleware.ts         — auth guard
│   └── styles/global.css
├── drizzle/                  — миграции (generated)
├── Dockerfile                — multi-stage, node:24-bookworm-slim
└── docker-compose.yml        — локальный postgres 18
```

## Стандарты

- **Функциональный стиль**, никаких классов/ООП. Проверяется ESLint (`functional/no-classes`).
- TypeScript `strict`, без `any`.
- Git hooks — не пропускаем (`--no-verify` запрещено).
- Подробнее — `CLAUDE.md`.
