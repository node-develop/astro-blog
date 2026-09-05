# Технический аудит и апгрейд — 5 сентября 2026

Ветка `audit/sept-2026` (от `origin/main` 01daa77, 24 авг). 19 коммитов, 167 файлов.
Прод на момент аудита: `01daa77`, Node 24.19, билд 24.08 — совпадает с `main`.

## Проверка

| Шаг | Результат |
| --- | --- |
| `pnpm typecheck` | 0 ошибок |
| `pnpm lint` | чисто |
| `pnpm build` (Astro 7, Rust compiler, Mermaid через Playwright) | ок, 0 KaTeX-warnings (было 37) |
| `pnpm vitest run` | 785 passed / 23 skipped; 5 файлов требуют Docker (Postgres/testcontainers) — гоняет новый CI-job `integration` |
| `pnpm translate:check` | в синхроне |
| Production standalone smoke + SEO utility routes | ок |
| Админка на живой БД (PGlite + миграции 0000–0006 + bootstrap-admin) | логин и все страницы `/admin/*` отвечают 200, скриншоты в outputs |
| `pnpm audit --prod` | 2 moderate, оба транзитивные (esbuild ≤0.24 через `better-auth→drizzle-kit`, fflate <0.7.5 через `satori`) — ждём апстрим |

## Найдено и исправлено

### Критично для прода

1. **Логин в админку не работал на проде.** Better-Auth не принимает URL с завершающим слэшем, а `trailingSlash: "always"` заставляет клиентов слать `/api/auth/sign-in/email/` → 404; форма без слэша получает 301 (браузер переигрывает POST как GET). Проверено на artka.dev: `/api/auth/ok/` → 404. Фикс: `[...all].ts` срезает слэш перед `auth.handler`; smoke-тест теперь требует `/api/auth/ok/` → 200 и запрещает 404 на sign-in.
2. **Better-Auth 1.7 требует колонку `accounts.issuer`** — без неё любой sign-in даёт «User not found». Миграция `0006_account_issuer` добавляет колонку, бэкфиллит `local:credential` / `local:oauth:<provider>`, ставит NOT NULL + уникальный индекс `(issuer, account_id)`. `ensureAdminUser` пишет issuer. **Применить миграцию до/при деплое** (entrypoint делает это сам).
3. **Цены в курсе рендерились как формулы KaTeX** (`$3/M … $15/M` → inline math) в уроках 02/09/10/11/14, RU+EN. Экранированы `\$` вне кода.
4. **Docker: загрузки из `/admin/media` были недоступны в проде** (писались в `public/uploads`, а node-адаптер отдаёт только `dist/client`). Теперь `UPLOADS_DIR=/app/dist/client/uploads` + `VOLUME`; в Dokploy нужно примонтировать persistent volume (runbook `docs/runbooks/dokploy-uploads-volume.md`). Также в образ не копировались коллекции `projects` и `courses` (правки в админке падали с ENOENT), healthcheck бил в SSR `/` (зависит от БД) → `/api/version`.

### Админка

- `/admin/home` и `/admin/posts` читали build-time snapshot content layer: в проде «Сохранить EN» затирал свежий перевод и ставил `manuallyEdited`. Теперь чтение с диска (`readHomeFromDisk`, `listPostsFromDisk`), редактор шлёт только изменённые поля.
- `revisions.restore` терял `summary/keywords/faq`, не обновлял search vector и Pagefind — переиспользует путь `posts.upsert`.
- `site.update` затирал весь frontmatter кроме `title` — read-merge-write; `assertAdmin` первым.
- `posts.delete` не удалял EN-двойник → удаляет и логирует.
- Rate-limit Better-Auth (`/sign-in/email` 5/мин в prod), `Secure`-cookies в prod, security-заголовки на всех ответах (включая 403/redirect), `AUTH_TRUSTED_PROXIES` для многохоповых прокси.
- e2e-сидинг админа через `ensureAdminUser` (`signUpEmail` был отключён `disableSignUp`).
- HomeEditor: активный таб; PublishBar: ошибки автоперевода видны; MediaPicker: превью абсолютных обложек.
- +15 юнит-тестов (restore, site.update, home.update, publish urls).

### SEO / JSON-LD

- `Course` (landing) и `LearningResource` (уроки) — 30 страниц раньше были без типизации.
- `WebSite` разделён на `#website` / `#website-en` (был один `@id` с противоречивыми `inLanguage`).
- Посты: `ItemPage` с `@id`, `BlogPosting` ссылается на `#webpage`, `keywords` из frontmatter (раньше теги), `timeRequired`, `articleSection`, `isAccessibleForFree`, `FAQPage` привязан к посту, `BreadcrumbList` с `@id`.
- Tag-архивы — `ItemList` со ссылками вместо обрезанных копий `#blogposting`.
- `/about` — `ProfilePage` + `mainEntity`; `about: #person` больше не на всех страницах.
- Автор в одном варианте (`person.name`) в JSON-LD, `article:author`, RSS.
- Canonical на SSR-страницах через `canonicalUrl()`; `dateModified` учитывает `updatedDate`; валидный `<dl>` в FAQ.
- Sitemap: hreflang `ru/en/x-default` в urlset, `<lastmod>` в sitemap-index; hreflang не указывает на noindex-архивы.
- `og:image:alt`, `twitter:site` из `person.sameAs`, preload основного шрифта, `Cache-Control` для анонимных SSR-страниц.

### Видимость для агентов

- Markdown-двойники: `/blog/<slug>.md`, `/en/blog/<slug>.md`, уроки `/courses/<c>/<l>.md` (38 файлов) + `<link rel="alternate" type="text/markdown">`. В sitemap не попадают.
- `llms.txt` генерируется (все посты, уроки, страницы; секции по llmstxt.org); ложные утверждения убраны. `llms-full.txt` — полные тела RU (EN — excerpts, чтобы уложиться в 200 KB; 129 KB), `Cache-Control`.
- `robots.txt`: 20 UA-групп (добавлены CCBot, Applebot-Extended, Bytespider, meta-externalagent, Amazonbot, cohere-ai, DuckAssistBot, MistralAI-User, Diffbot…), ссылки на llms-файлы.
- `.well-known/security.txt`, `humans.txt`.
- IndexNow: ключ-роут `/<INDEXNOW_KEY>.txt`, пинг после `publish.one` (best-effort, лог через pino). **Задать `INDEXNOW_KEY` в окружении.**

### Harness / CI / документация

- CLAUDE.md: стек приведён к реальности (Astro 7, TS 6, Vitest 5…), ложное «no AI in runtime» заменено реальной LLM-политикой (три call-site), команды, раздел «Деплой», правила `src/lib/yaml.ts` и `astro/zod`.
- Агенты/скиллы без битых путей и версий (critic/backender/generated-search); README в синхроне.
- CI: job `integration` (testcontainers на ubuntu-latest), `pnpm audit` non-blocking, dependabot; docker-publish без мёртвого PR-тега и QEMU.
- `.env.example`: семантика `SITE_URL`, обязательные prod-переменные, `UPLOADS_DIR`, `AUTH_TRUSTED_PROXIES`, `INDEXNOW_KEY`.

## Апгрейд зависимостей (сентябрь 2026)

Astro 5.18→7.3 (`@astrojs/mdx` 8, `node` 11, `react` 6, `check` 0.9.10; remark/rehype через `@astrojs/markdown-remark` `unified()`, `compressHTML: true`, `security.checkOrigin`), TypeScript 5.9→6.0 (7.x без programmatic API — `astro check`/typescript-eslint не поддерживают), Vitest 3→5, ESLint 9→10 + eslint-plugin-astro 3, Playwright 1.63, shiki 4, pino 10, katex 0.18, satori 0.33, tailwind 4.3, better-auth 1.7, js-yaml 5 (обёртка `src/lib/yaml.ts`, YAML 1.1), diff 9, markdown-it 15, testcontainers 12, pnpm 10.34.5, engines Node ≥22.12.

Astro 6+: endpoint-ы с расширением недоступны со слэшем (`/rss.xml/` → 404, было 500) — тест обновлён.

## Что осталось / требует решения

- `drizzle/meta/0002_snapshot.json` отсутствует (описано в CLAUDE.md и db-migration skill); 0006 сгенерирован от 0005 корректно.
- `docs/claude-code-guide/gitnexus.md` дублирует `AGENTS.md` — консолидировать.
- e2e (Playwright) по-прежнему не в CI; integration-job добавлен, e2e — следующий шаг.
- `llms-full.txt` в режиме `en-excerpts`; поднять бюджет или вынести `/en/llms-full.txt`.
- pnpm 11/12 (новый формат lockfile) — отдельный апгрейд.
- HomeEditor: поле нельзя очистить до пустого (`""` = «оставить») — прежнее поведение, теперь заметнее.
- Better-Auth rate-limit включён только в prod (`NODE_ENV=production` или `AUTH_RATE_LIMIT=1`), чтобы e2e не упирались в 5/мин.
