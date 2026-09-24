---
name: deploy-check
description: Прогнать pre-deploy чеклист перед пушем в main — билд, тесты, типы, docker, миграции. Используй перед коммитом/пушем на deploy или когда пользователь спрашивает "всё готово к деплою?".
allowed-tools: ["Read", "Bash(pnpm:*)", "Bash(docker:*)", "Bash(git:*)"]
---

# Pre-deploy чеклист

Перед пушем в `main` (что триггерит GitHub Actions → docker build → push в ghcr.io) — прогнать всё.

## Шаги

1. **Git чистый**:

   ```bash
   git status
   ```

   Нет uncommitted / untracked важного. `.env` точно не в индексе.

2. **Типы**:

   ```bash
   pnpm typecheck
   ```

   Должно быть 0 ошибок. Если есть — FIX перед деплоем.

3. **Линт**:

   ```bash
   pnpm lint
   ```

4. **Тесты**:

   ```bash
   pnpm test            # unit
   pnpm test:db         # Postgres через Testcontainers, нужен Docker
   ```

   Оба зелёные. Built-тесты — после билда (шаг 5).

5. **Билд**:

   ```bash
   pnpm build
   ```

   Билд должен пройти без warnings. Проверь размер `dist/` — не взорвался ли (лимит ~10 МБ).
   Затем `pnpm test:built` — проверки собранного сайта и standalone-сервера (как в CI-джобе `build`).

6. **Миграции**:
   - Если менял `src/lib/db/schema.ts` — `pnpm db:generate` сделан?
   - В `drizzle/` лежит новая миграция + `_journal.json` обновлён?
   - Миграция применена локально (`pnpm db:migrate`) и проверена?

7. **Docker build локально**:

   ```bash
   docker build -t astro-blog:local .
   docker run --rm -p 4321:4321 --env-file .env.local astro-blog:local
   ```

   Контейнер стартует, главная страница отвечает 200.

8. **Env vars**:
   - Все новые env-переменные есть в `.env.example`?
   - Секреты добавлены в GitHub Actions secrets (Settings → Secrets)?
   - `production.env` на сервере обновлён?

9. **Ветка**:
   ```bash
   git log main..HEAD --oneline
   ```
   Пробегись глазами по коммитам — нет ли случайных dev-дампов.

## Verdict

- Всё ✓ → `git push` safely.
- Что-то падает → STOP, фикси, не деплой.

## Антипаттерны

- "У меня локально работает" без `pnpm build` — не считается.
- Пропустить миграции БД — самый частый источник прод-поломок.
- `git push --force main` — НИКОГДА.
- Деплой в пятницу вечером — no comment.
