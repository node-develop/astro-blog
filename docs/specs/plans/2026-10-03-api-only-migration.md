# План: переход на API-only контент и агентную фабрику

Дата: 3 октября 2026
Статус: принят, к реализации
Ранбук с промптами для Claude Code: `docs/runbooks/api-only-agent-prompts.md`
Полный разбор с источниками: артефакт «artka.dev: план перехода на API-only и фабрику» в проекте claude.ai

## Решение

Content API `/api/v1` становится единственным путём записи статей. Посты уходят из git в Postgres (`content_articles`) и S3. Astro собирает сайт из JSON-снапшота контента через кастомный loader, SSG сохраняется. Воркер после публикации запускает пересборку через GitHub Actions `repository_dispatch`: только так каждая публикация проходит полный набор SEO-гейтов (сборка на VPS через Dokploy API их обошла бы). Агенты работают через MCP-сервер над API, админка становится клиентом того же API. Коллекции `site`, `projects`, `courses` пока остаются файлами.

Два варианта отклонены:

- Dokploy API `application.deploy` как триггер: сборка на VPS пропускает CI-гейты, токен в build-arg попадает в слои образа.
- Live collections Astro (SSR из БД без пересборки): нет готового HTML до выкладки, значит нечего проверять на CI.

## Инварианты, которые закрепляются тестами

1. `entry.id` поста равен `slug` для RU и `en/slug` для EN. От этого зависят URL, OG, hreflang (`checkCounterpartExists`), `posts_meta`, seed в `card-art`.
2. Frontmatter передаётся в `renderMarkdown`. Без него `remark/flag-math.ts` бросает ошибку, а `strip-frontmatter-duplicates.ts` молча перестаёт убирать дублирующий H1 и лид.
3. `entry.body` равен `content_publications.content` (с «Источниками» и «Читайте также»), иначе расходятся время чтения, `articleBody` в JSON-LD, RSS и `llms-full.txt`.
4. Пустой или урезанный снапшот останавливает сборку: `count === 0` или меньше `content-manifest.json`.
5. Каждая страница в dist несёт `data-content-revision`, равный id публикации из снапшота, и присутствует в sitemap своего языка.
6. Export отдаёт желаемое состояние по `content_articles.build_publication_id`, не `publishedContent` (он выставляется только после верификации живой страницы, иначе ожидающая версия никогда не попадёт в сборку).

## Контракт сборки

- `GET /api/v1/export/`, скоуп `content:export`, отдельный read-only ключ для CI. Формат: `{snapshotId, generatedAt, count, articles:[{slug, lang, revision, content, contentSha256, meta:{order, pinned, hiddenFromList}}]}`. Черновики не попадают.
- Loader `src/lib/content/articles-loader.ts` читает `CONTENT_SNAPSHOT` (путь к JSON). Для каждой статьи: `parseFrontmatter`, `parseData` по той же Zod-схеме, `renderMarkdown(body, {frontmatter})`, `store.set({id, data, body, rendered, digest})`.
- CI: job `snapshot` скачивает JSON с ретраями и проверкой схемы, артефакт идёт в `validate` и в Docker build context. Токен не попадает в образ. Снапшот архивируется в S3 `snapshots/<id>.json`.
- Dockerfile: `COPY content-snapshot.json`, `ENV CONTENT_SNAPSHOT`, build-arg `CONTENT_SNAPSHOT_ID` в `/api/version`, `playwright install` до `COPY . .`, `verify-content-build.ts` сразу после `pnpm build`. Убрать `COPY src/content/posts`.
- Теги образа: `sha-<git>` и `content-<snapshotId>`. `concurrency: {group: deploy-main, cancel-in-progress: false}`.
- Для PR с кодом без секрета: `tests/fixtures/content-snapshot.json` (math, mermaid, обложка, пара RU/EN, только RU, скрытая).
- Локально: `pnpm content:pull` скачивает прод-снапшот, по умолчанию `astro sync` и dev берут фикстуру.

## Схема данных (миграция A, только добавления)

- `content_article_versions(article_id, version, document, actor_key_id, actor_user_id, created_at)`, PK `(article_id, version)`; backfill текущих документов как версия 1.
- `content_articles`: `build_publication_id`, `last_modified_at`, `source_version` (для EN: какая версия RU переведена), `unpublished_at`, `manually_edited`.
- `content_publications`: `kind` (publish | unpublish), `batch_id`, `dispatched_at`, `hooks_done_at`.
- `content_api_keys`: системная строка `admin-session` с `token_hash`, не проходящим regex токена (сессия админки получает её `keyId`, FK остаются NOT NULL).
- Статус статьи в API: `draft | published | changed | publishing | failed | unpublished`.

Миграция B (после cutover): drop `post_revisions` с триггером `prune_post_revisions` (0002) и `content_guard_manual_revision` (0007), `media_assets`, колонки `base_manual_revision_id`, `base_remote_hash`, `commit_sha`; снять том `uploads`.

## API-дельта

Новые эндпоинты: `GET /articles/` с фильтрами, `GET /articles/by-slug/{slug}/`, `GET /articles/{id}/versions/`, `POST .../versions/{n}/restore/`, `POST /articles/{id}/translate/`, `POST /articles/import/` (скоуп `articles:import`, только CLI-ключ), `POST /articles/{id}/unpublish/`, `DELETE /articles/{id}/` (только черновики), `POST /publish/` (batch RU+EN), `GET /publications/`, `GET /media/`, `POST /articles/preview/`, `PATCH /posts-meta/{slug}/`, `PUT /posts-meta/order/`, `GET/POST/.../social/*`, `GET/POST/DELETE /keys/` (только сессия), `GET /whoami/`, `GET /export/`.

Убирается: `manualRevision`, `manualEditsPending`, `acknowledgedManualRevisionId`, `remote`, `expectedRemoteHash`, коды `remote_edit_conflict`, `branch_busy`, `path_conflict`, проверка slug по файлам на диске (`service.ts:86-96, 258-260`), `commitArticle`, `readRemoteArticle`, `articlePath`. Остаётся: `expectedVersion`, `publication_in_progress`, идемпотентность, `immutable_identity`.

Упрощение контракта: `externalId` по умолчанию = slug, `provenance.agent` по умолчанию = имя ключа, `cover.url` для сайтовых путей, `sources.min(0)` только для `provenance.agent = import`.

Аутентификация: `authorize(request, locals, scope)` возвращает `Principal {kind: key | session, keyId, scopes, userId?}`. Сессия без лимита 60/мин, с явной проверкой `Origin` на не-GET. `[...path].ts` превращается в таблицу `routes.ts`.

## Воркер

- После сохранения: только транзакция `mutateOnce` (validate, update, insert version, идемпотентный ответ). Job только при `mode = publish`.
- `queued`: проверка ключа и версии, `posts_meta` через `onConflictDoNothing`, `build_publication_id`, `requestRebuild(batchId)` через `POST /repos/{owner}/{repo}/dispatches` (`event_type: content-publish`). Один dispatch на batch, debounce 60-120 с. Состояние `publishing`, `dispatched_at`.
- `publishing`: существующий `verifyPublication` по `data-content-revision`, HEAD картинок, sitemap, плюс `contentSnapshotId` в `/api/version`. Для `unpublish` обратная проверка: 404 и отсутствие в sitemap. Таймаут 30 минут. При `failed` указатель `build_publication_id` откатывается на последнюю успешную публикацию.
- `published`: `publishedVersion`, `publishedContent`, `firstPublishedAt`, search vector.
- Хуки (`hooks_done_at IS NULL`): `pingIndexNow` (вынести из `publish.ts` в `src/lib/seo/indexnow.ts`), `sitemaps.submit` в Search Console API, `kickoffSocial`. Ошибка хука логируется и повторяется до 3 раз, публикацию не валит.
- Выбор задачи: `nextAttemptAt <= now`, а не самая старая (сейчас одна зависшая задача блокирует очередь до 30 минут, `worker.ts:37-43`).
- Супервизия: воркер встраивается в процесс сервера (setInterval) либо `content-worker.mjs` получает healthcheck по `last_worker_tick`.

## Социальный слой

`src/lib/social/service.ts`: `kickoffSocial`, `publishDraft`, `saveDraft`, `skipDraft`, `recheckDraft`, `regenerate` без `ActionAPIContext`. `loadArticle` читает RU из `content_articles`, `hasEnTwin` равен `en.publishedVersion != null`. Защита от повтора покaнальная (сейчас при EN позже RU каналы `x_en` и `li_en` не создаются, `socialDrafts.ts:139-145`). `_social.ts:53` передаёт абсолютный URL картинки вместо `/og-default.png`.

## CI-гейты

Стадия 1, в API при `validate` и `publish`: минимум 1200 слов без кода, `sources` не меньше 3 для publish, 2 внутренние ссылки или `relatedSlugs`, уникальный `title` в языке, alt у каждой картинки, `accTitle`/`accDescr` у каждого Mermaid, обложка не заглушка и не уже 1200 px, запрещённые фразы из `banned-phrases.json`, спекулятивный голос. Для draft warnings, для publish ошибки. Критик статей `POST /articles/{id}/review/` по образцу `critic.ts`.

Стадия 2, по dist в `validate` на реальном снапшоте:

| Проверка | Инструмент |
| --- | --- |
| JSON-LD: граф без висячих `@id`; BlogPosting с `headline`, `datePublished`, `dateModified`, `author` (Person с `url`/`sameAs`), `image`, `inLanguage`, `url` = canonical; Person, Organization, WebSite, BreadcrumbList по своей схеме | `verify-seo-build.ts` + Zod-схема + типы `schema-dts` в генераторе графа |
| hreflang: взаимность RU/EN, self-reference, `x-default`, canonical каждой версии на себя | свой скрипт на cheerio |
| Sitemap: валидный XML, каждый URL имеет файл, `lastmod` = `dateModified`, каждая статья снапшота присутствует, скрытые отсутствуют | xmllint + `verify-content-build.ts` |
| `data-content-revision` на каждой странице совпадает со снапшотом | `verify-content-build.ts` |
| Картинки: alt, width/height, формат, вес; `og:image` не меньше 1200x630; `twitter:card`; `max-image-preview:large`; обложка шире 1200 px | свой скрипт + `image-size` |
| SVG/Mermaid: нет `<pre class="mermaid">`, у каждого SVG `<title>` или `aria-label`, data-URI парсится, `<figure>` с подписью | свой скрипт |
| Валидность HTML | `html-validate` |
| Внутренние ссылки и якоря | `lychee` offline (если не подтвердится, `linkinator`) |
| SEO и a11y e2e, скриншоты `og:image` и Mermaid в light/dark | Playwright + axe |
| Бюджеты Lighthouse на 3 страницах; полный обход на main | Unlighthouse (Lighthouse 13) |

Стадия 3, после выкладки: ожидание `contentSnapshotId`, проверка каждой статьи batch (200, маркер, canonical, hreflang, JSON-LD, картинки 200, sitemap, нет noindex), затем IndexNow (Bing, Яндекс) и `sitemaps.submit`. Google Indexing API не используем, ping sitemap отключён с 2023. FAQPage остаётся, но не гейт: Google не показывает FAQ rich results с мая 2026.

По расписанию: внешние ссылки lychee раз в неделю, PageSpeed Insights API раз в сутки на 2 URL, `web-vitals` в проде.

## Блокеры cutover

| Блокер | Где | Что делать |
| --- | --- | --- |
| `COPY src/content/posts` | `Dockerfile:55` | Убрать вместе с backfill |
| `backfill-prod.mjs:22` readdir по постам, ENOENT даёт exit 1, `set -e` не стартует контейнер | `docker-entrypoint.sh:12-15` | Удалить скрипт и вызов |
| Рантайм читает файлы: `isPublishedFile` для `relatedSlugs` (`service.ts:86-96`), `slug_conflict` (`:259`), `loadArticle`/`hasEnTwin` (`_social.ts:26-56`), админка | 5 мест | На `content_articles` до удаления файлов |
| Триггер `content_guard_manual_revision` | `0007:84-98` | Убрать с `post_revisions`, `requireIdle` достаточно |
| Очередь воркера блокируется зависшей задачей | `worker.ts:37-43` | Выбор по `nextAttemptAt <= now` |
| `content-worker.mjs` без супервизии | `docker-entrypoint.sh:22-24` | Встроить в сервер или healthcheck |
| Импорт: `sources.min(1)`, `keyId` NOT NULL, `cover: /og-default.png`, Mailu уже в API, `claude.md` с raw HTML | скрипт импорта | `provenance.agent = import`, системный ключ `legacy-import`, cover не задавать, Mailu проверить и пропустить, `claude.md` вне БД |
| `serializeArticle` меняет экранирование через remark-stringify и prettier | `content-api/markdown.ts` | Сравнить HTML 14 страниц до и после без `data-content-revision` |
| Тесты на файлах и реальных slug: `mobile-toc.spec.ts` дописывает в реальный пост, `global-setup.ts`, `admin-*`, `admin-media`, `landing-content.test.ts:78-96`, `deploy-gate.test.ts:26-27`, `ci-workflow.test.ts:42`, posts-h1, content/schema, seo/media-output, content-api/github, actions/_social, publish.no-op-social | около 15 файлов | На фикстуру и сид БД |
| Снятия с публикации нет | API | `kind = unpublish` |

Выкладка в два шага: сначала export и импорт при живых файлах, затем переключение loader, и только потом удаление файлов и старого кода.

## Этапы

| Этап | Срок | Часы | Критерий приёмки |
| --- | --- | --- | --- |
| 0. Снять трение сейчас | неделя 1 | 20-24 | Публикация старым путём не падает от косметики; спайк подтвердил рендер с math и Mermaid через `renderMarkdown` |
| 1. API как единственный писатель | недели 2-3 | 60-70 | Интеграционные тесты Principal, expectedVersion, версий, translate, хуков; старый путь ещё работает |
| 2. Сборка из снапшота и CI-гейты | недели 4-5 | 55-65 | HTML из снапшота идентичен файловой сборке на 14 страницах; все гейты зелёные; сломанный JSON-LD и пустой снапшот роняют CI |
| 3. Cutover, MCP, скиллы | неделя 6 | 45-50 | Сценарий «ссылка в Claude Code, статья RU+EN на сайте, драфты в три канала» проходит с одним ревью; `src/content/posts` в репо нет |
| 4. Иллюстрации, полная админка, обратная связь | недели 7-9 | 50-60 | Каждая статья выходит с обложкой 1200x675 и alt; агент видит статус индексации |

Правила работы (из CLAUDE.md): каждый шаг этапа отдельная сессия с бюджетом и чекпоинтом (`pnpm typecheck`, `pnpm test`, ручная проверка); architect и critic перед каждым шагом на 3+ файла; перед правкой символа найти всех вызывающих (`git grep -n -w`); никаких `--no-verify`.

## Открытые вопросы до старта

- [ ] `renderMarkdown` в Astro 7.3 использует `markdown.processor` из конфига? Спайк первым делом. Запасной путь: `src/lib/markdown/pipeline.ts` с `createMarkdownProcessor`.
- [ ] Сайт за Cloudflare? Разрешить раннеры GitHub для `GET /api/v1/export/`.
- [ ] `GITHUB_PAT` имеет Contents: write (нужно для `repository_dispatch`)?
- [ ] Статья про Mailu в `content_articles` на проде: `publishedContent` совпадает с файлом в git?
- [ ] Точная версия MCP SDK v2 в npm и совместимость с Claude Code на десктопе.
- [ ] X: тариф существующего приложения. LinkedIn: есть ли refresh-токен. Telegram: лимиты подписи и права бота.
- [ ] Unlighthouse держит пороги в CI? Иначе lhci или прямой Lighthouse 13.
- [ ] `lychee` в офлайн-режиме по dist, иначе `linkinator`.
- [ ] Сервисный аккаунт Search Console для `sitemaps.submit` и `urlInspection`.
- [ ] `x-default`: RU или EN.
- [ ] Судьба черновика `claude.md`.
