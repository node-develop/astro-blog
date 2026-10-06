# Промпты для Claude Code: переход на API-only контент и агентную фабрику

Дата: 3 октября 2026
Репозиторий: `/Users/artemkashuta/Documents/astro-blog`
План: `docs/specs/plans/2026-10-03-api-only-migration.md`
Формат такой же, как в `docs/runbooks/week-1-agent-prompts.md`: один промпт на одну сессию Claude Code.

---

## Сначала прочитайте это сами

**Как запускать.** В терминале: `cd ~/Documents/astro-blog && claude`. Каждый промпт ниже это отдельная сессия: он начинается с бюджета и заканчивается чекпоинтом. Не склеивайте два промпта в одну сессию, иначе контекст поплывёт и агент начнёт заново предлагать то, что вы уже отклонили (правило «Budgets» из CLAUDE.md).

**Порядок.** Этап 0 идёт первым и не зависит от остальных. Этапы 1 и 2 можно вести параллельно в двух ветках после промпта 1.8 (export). Этап 3 только после зелёных 1 и 2. Внутри этапа порядок промптов обязателен: нумерация отражает зависимости.

**Ветки.** Этап 0: `chore/stage-0-friction`. Этап 1: `feat/content-api-single-writer`. Этап 2: `feat/content-snapshot-build`. Этап 3: `feat/api-only-cutover`. Каждый промпт заканчивается коммитом в свою ветку; PR в `main` по завершении этапа. Ветки 1 и 2 сливаются в `main` до начала этапа 3.

**Что агент не решает сам.** Открытые вопросы из плана (Cloudflare, права `GITHUB_PAT`, тарифы соцсетей, `x-default`, судьба `claude.md`). Если промпт упирается в один из них, агент должен остановиться и спросить, а не угадывать.

**Что делать руками, агенту не отдавать.** Верификация Яндекс.Вебмастера и Bing Webmaster, сервисный аккаунт Search Console, OAuth для X и LinkedIn (`pnpm social:auth:*`), секреты в GitHub (`CONTENT_EXPORT_TOKEN`) и Dokploy, первая строка в `docs/audits/google-indexing-tracking.md`.

**Общая преамбула.** Каждый промпт ниже начинается с одного и того же блока, он здесь один раз, чтобы не повторять:

```
Контекст: план docs/specs/plans/2026-10-03-api-only-migration.md, раздел с
номером этого шага. Прочитай CLAUDE.md целиком и соблюдай «Стандарты кода»,
«Working rules» и «Запреты». Перед правкой любого символа с зависимостями
найди всех вызывающих (git grep -n -w). Для задач на 3+ файла сначала
architect, потом critic, потом реализация, в конце снова critic.
Без --no-verify. В конце шага: pnpm
typecheck, pnpm test, pnpm test:db (нужен Docker), после сборки pnpm test:built,
краткий отчёт «что сделано, что проверено, что осталось». Вывод lint и
typecheck читать без фильтров и по коду возврата: pre-push гоняет то же самое.
Если упираешься в открытый вопрос из плана, остановись и спроси.
```

---

# Этап 0. Снять трение сейчас (неделя 1, ветка `chore/stage-0-friction`)

## Промпт 0.1. Спайк: renderMarkdown в Astro 7.3

От результата зависит дизайн loader'а в этапе 2. Делайте первым.

```
[преамбула]

Бюджет: не больше 25 шагов, только чтение и временные файлы, ничего не коммить
кроме отчёта.

Задача: выяснить, уважает ли context.renderMarkdown() из Content Loader API в
Astro 7.3 (package.json: astro ^7.3.1) настройку markdown.processor: unified()
и список remark/rehype плагинов из astro.config.ts.

Сделай:
1. Прочитай astro.config.ts (секция markdown) и node_modules/astro/dist/content/
   (ищи renderMarkdown, createMarkdownProcessor, как glob-loader рендерит .md).
2. Создай временную коллекцию src/content.config.spike.ts (или временно добавь
   коллекцию в content.config.ts) с inline-loader'ом, который кладёт одну
   статью: возьми тело src/content/posts/json-ld-graph-astro.md (там есть
   mermaid и ссылки) и добавь абзац с формулой $E = mc^2$. Передай frontmatter
   {title, description} в renderMarkdown.
3. Запусти pnpm exec astro sync и pnpm build. Проверь в результате рендера:
   - rendered.metadata.frontmatter.hasMath === true (плагин remark/flag-math.ts);
   - в HTML есть <img src="data:image/svg+xml (rehype-mermaid через Playwright);
   - есть heading-anchor и tabindex на таблицах (rehype-autolink-headings,
     rehype/focusable-tables.ts);
   - дублирующий H1 из тела удалён (remark/strip-frontmatter-duplicates.ts);
   - внутренние ссылки без .md (remark/strip-md-suffix.ts).
4. Если хотя бы один пункт не выполняется, покажи, чем отличается путь
   renderMarkdown от того, как glob-loader рендерит .md, и оцени запасной путь:
   вынести массивы плагинов из astro.config.ts в src/lib/markdown/pipeline.ts
   и вызывать createMarkdownProcessor из @astrojs/markdown-remark с тем же
   списком. Один источник конфигурации обязателен.
5. Удали временную коллекцию. Запиши результат в
   docs/specs/2026-10-03-render-markdown-spike.md: что работает,
   что нет, какой путь выбран для loader'а, с цитатами из кода Astro.
6. Закоммить только spec: `docs(spike): renderMarkdown in Astro 7.3 for API loader`.
```

## Промпт 0.2. Dockerfile и workflow

```
[преамбула]

Бюджет: 20 шагов.

Задача: убрать лишнюю работу из сборки без изменения её результата.

1. Dockerfile: сейчас COPY . . (строка 24) стоит раньше playwright install
   (строка 26), поэтому слой с Chromium инвалидируется на каждый коммит.
   Переставь: сначала COPY package.json pnpm-lock.yaml .npmrc, установка
   зависимостей и playwright install --with-deps chromium-headless-shell, и
   только потом COPY . . и pnpm build. Проверь, что runner-стадия не меняется.
2. .github/workflows/docker-publish.yml: добавь
   concurrency: { group: deploy-main, cancel-in-progress: false }.
   Добавь триггер repository_dispatch с types: [content-publish] (сам dispatch
   появится в этапе 2, триггер нужен уже сейчас, чтобы тесты workflow его
   знали). Условие шага Dokploy: push || repository_dispatch.
3. (Выполнено и устарело: tests/unit/ci-workflow.test.ts и deploy-gate.test.ts
   потом удалены из main, а .claude/hooks/test-guard.sh запрещает тесты,
   читающие YAML. Порядок шагов workflow проверяет сам CI.)
4. Локальная проверка образа по скиллу deploy-check: собери образ дважды подряд
   и покажи, что второй раз слой Chromium взят из кэша.
5. Коммит: `build(docker): cache the Chromium layer and gate deploys with concurrency`.
```

## Промпт 0.3. Воркер Content API: очередь и супервизия

```
[преамбула]

Бюджет: 25 шагов.

Три известные проблемы в src/lib/content-api/worker.ts и docker-entrypoint.sh:

1. worker.ts:37-43 берёт самую старую задачу в queued/publishing; если у неё
   nextAttemptAt в будущем, возвращает worked:false и не трогает остальные.
   Одна зависшая публикация блокирует очередь до 30 минут. Исправь выбор:
   задача с nextAttemptAt <= now(), упорядоченная по createdAt. Напиши
   integration-тест (testcontainers, как tests/integration/content-api.test.ts):
   две задачи, у первой nextAttemptAt через час, вторая должна обработаться.
2. scripts/content-worker.mjs запускается в docker-entrypoint.sh:22-24 фоном
   через & без супервизии; при CONTENT_WORKER_SECRET короче 32 символов он
   молча выходит (content-worker.mjs:6-9), и контейнер живёт без воркера.
   Выбери через architect один из двух вариантов и реализуй:
   (а) встроить цикл воркера в процесс сервера (setInterval в точке старта
   node-адаптера, за флагом CONTENT_WORKER_INLINE=true), (б) оставить отдельный
   процесс, но писать last_worker_tick в таблицу и проверять его в
   GET /api/version, чтобы healthcheck Dockerfile падал без воркера.
   Короткий секрет должен ронять старт контейнера, а не молча выходить.
3. Хуки после published пока не трогай (это этап 1), но вынеси pingIndexNow и
   publishedUrlsFor из src/actions/publish.ts в src/lib/seo/indexnow.ts без
   изменения поведения; publish.ts импортирует их оттуда. Тесты
   tests/unit/actions/publish.urls.test.ts должны пройти без правок логики.

Коммиты по одному на пункт.
```

## Промпт 0.4. Перевод: хеш по содержанию, drift как предупреждение

Временное облегчение до этапа 3, после cutover эта логика для постов уйдёт. Делать стоит, потому что статьи продолжат выходить старым путём ещё 5 недель.

```
[преамбула]

Бюджет: 30 шагов.

1. src/lib/translate/hash.ts, translate-one.ts:281, scripts/translate-check.ts:174:
   sourceHash сейчас это sha256 всего RU-файла. Замени на хеш содержания:
   sha256(normalize(body) + title + description + summary + JSON(faq) + coverAlt),
   где normalize убирает хвостовые пробелы и нормализует переводы строк.
   updatedDate, keywords, cover, tags в хеш не входят.
2. scripts/translate-check.ts:255-274: drift перестаёт быть ошибкой. CI падает
   только на missing twin, orphan EN, unbuilt курс, нарушение Zod. Drift
   печатается как warning со списком slug.
3. .github/workflows/ci.yml: переставь шаг translate:check до
   verify:seo-build, чтобы падать за 30 секунд, а не через 10 минут.
4. Любая запись EN-файла не из translateOne (actions/posts.ts, site-io.ts)
   выставляет manuallyEdited: true, как уже делает actions/home.ts:68.
5. Удали scripts/refresh-en-sourcehash.ts и абзацы про ручной sha256 в
   .claude/skills/new-blog-post/SKILL.md (§2.6, §2.7) и в
   docs/runbooks/week-1-agent-prompts.md.
6. Пересчитай sourceHash во всех EN-файлах новым способом одним скриптом,
   закоммить результат отдельным коммитом `chore(i18n): rebase sourceHash on content`.
7. tests/unit/seo/landing-content.test.ts:78-96 сравнивает sha256 файла:
   перепиши на новую функцию. tests/unit/translate-check.test.ts обнови.
8. Удали мёртвые ключи home.* и meta.home.* из src/i18n/.strings.hashes.json.
9. Одна строка про модель перевода в CLAUDE.md и README: модель берётся из
   src/lib/translate/claude.ts (сейчас claude-sonnet-5); проверь, что этот id
   резолвится в API, если нет, замени на актуальный и вынеси в env
   TRANSLATE_MODEL с дефолтом.
```

## Промпт 0.5. Mermaid и картинки как иллюстрации

```
[преамбула]

Бюджет: 30 шагов. Визуальные изменения через designer до реализации.

1. Добавь accTitle и accDescr во все 9 Mermaid-блоков в src/content/posts/*.md
   (7 RU-файлов) и в их EN-двойниках. Тексты осмысленные, по содержанию
   диаграммы, на языке файла. После правки RU пересчитай sourceHash (после
   промпта 0.4 это делает pnpm translate без API-вызова при совпадении хеша;
   проверь, что EN не перегенерировался).
2. Напиши rehype-плагин src/lib/rehype/mermaid-figure.ts: оборачивает
   <img src="data:image/svg+xml..."> из rehype-mermaid в <figure class="diagram">
   с <figcaption>, подпись берётся из accTitle (rehype-mermaid кладёт его в
   <title> внутри SVG или в alt, проверь по выводу), нумерация «Схема N».
   Подключи в astro.config.ts после rehypeMermaid. Для .md это замена
   src/components/mdx/Diagram.astro, который работает только в MDX.
3. src/styles/prose.css: правила для .prose img, figure, figcaption, .diagram
   в постерной системе (slab-рамка, hard-shadow, подпись в label-face), см.
   src/styles/tokens.css и .claude/skills/design-system-tokens/SKILL.md.
   Сейчас есть только дефолт @tailwindcss/typography.
4. src/layouts/BaseLayout.astro: meta robots с max-image-preview:large на
   индексируемых страницах (сейчас robots-meta ставится только для noindex,
   строка 242).
5. src/lib/seo/sitemap.ts: <image:image> для обложки поста; src/lib/feeds/*:
   <enclosure> в RSS и image в JSON feed.
6. src/actions/_social.ts:53: вместо fm.cover как есть передавать абсолютный
   URL: если cover это /og-default.png или пустой, брать postOgPath() с
   CANONICAL_ORIGIN. Тест в tests/unit/actions/_social.test.ts.
7. Добавь в tests/unit/seo/: тест, что в dist нет <pre class="mermaid">, что
   у каждого SVG из Mermaid есть <title> или aria-label, что на страницах
   постов есть max-image-preview:large.
8. Коммиты по пунктам. Скриншот страницы с диаграммой в light и dark до и
   после приложи к отчёту.
```

---

# Этап 1. API как единственный писатель (недели 2-3, ветка `feat/content-api-single-writer`)

Старый путь (файлы, админка, git) в этом этапе продолжает работать. Ничего не удаляется.

## Промпт 1.1. Миграция A

```
[преамбула]

Бюджет: 25 шагов. Скилл db-migration обязателен. Помни про отсутствующий
drizzle/meta/0002_snapshot.json (CLAUDE.md, «Известный пробел»): сначала
pnpm exec drizzle-kit check, потом db:generate, потом ревью diff.

Добавь в src/lib/db/schema.ts (только добавления, ничего не удалять):
1. Таблица content_article_versions(article_id FK, version int, document jsonb,
   actor_key_id FK content_api_keys nullable, actor_user_id FK user nullable,
   created_at), PK (article_id, version).
2. content_articles: build_publication_id uuid nullable FK content_publications,
   last_modified_at timestamptz, source_version int nullable, unpublished_at
   timestamptz nullable, manually_edited boolean default false.
3. content_publications: kind text default 'publish' (check publish|unpublish),
   batch_id uuid nullable, dispatched_at, hooks_done_at.
4. Системная строка content_api_keys name='admin-session' с token_hash, который
   не может совпасть с хешем реального токена (например фиксированная строка
   'session:' + 64 нуля), scopes = все, revoked_at null. Вставляется миграцией
   с ON CONFLICT DO NOTHING.
5. Backfill в той же миграции: для каждой content_articles строка версии 1 с
   текущим document.
6. Запиши решения в docs/specs/2026-10-03-content-api-single-writer.md
   (раздел «Схема данных»), тесты на миграцию через testcontainers.
Коммит: `feat(db): article versions, build pointer and publication batches`.
```

## Промпт 1.2. Principal, таблица маршрутов, whoami

```
[преамбула]

Бюджет: 35 шагов.

1. src/lib/content-api/auth.ts: функция authorize(request, locals, scope) ->
   Principal {kind: 'key' | 'session', keyId, scopes, userId?}. С заголовком
   Bearer текущая логика. Без Bearer: locals.user с ролью admin (см.
   src/lib/auth/ensure-admin.ts и middleware), principal получает все скоупы и
   keyId строки admin-session. Для сессии лимит 60/мин не применяется, но на
   любой не-GET обязательна проверка заголовка Origin против CANONICAL_ORIGIN
   (src/lib/seo/url-policy.ts); несовпадение даёт 403 origin_mismatch.
   Поведение Astro checkOrigin для application/json не считать достаточным.
2. src/pages/api/v1/[...path].ts превратить в диспетчер над
   src/lib/content-api/routes.ts: массив {method, pattern, scope, idempotent,
   handler}. Все существующие маршруты перенести без изменения поведения.
   Маршруты /keys/* доступны только principal.kind === 'session' (Bearer
   получает 403 key_cannot_manage_keys).
3. GET /whoami/ возвращает {kind, keyName, scopes}.
4. Integration-тесты: cookie админа может писать; роль reader 403; без cookie
   401; POST с чужим Origin и cookie 403; Bearer как прежде; /keys по Bearer 403;
   лимит 60/мин не применяется к сессии.
5. Обнови openapi.ts (security scheme cookie) и docs/content-api.md.
```

## Промпт 1.3. Чтение

```
[преамбула]

Бюджет: 30 шагов.

Добавь в contract.ts, service.ts, routes.ts, openapi.ts:
1. GET /articles/?lang&status&agent&tag&q&limit&cursor. Поле status
   вычисляется: draft (нет publishedVersion), published (publishedVersion ==
   version), changed (version > publishedVersion), publishing (есть активная
   публикация), failed (последняя публикация failed), unpublished
   (unpublished_at не null). Ответ содержит slug, lang, title, tags, url,
   provenance.agent, version, publishedVersion, status, updatedAt.
2. GET /articles/by-slug/{slug}/ -> {ru, en} с теми же полями плюс
   translation {sourceVersion, stale}.
3. GET /articles/{id}/versions/ и /versions/{n}/.
4. GET /publications/?articleId&state.
5. GET /media/?cursor по content_assets.
6. GET /posts-meta/{slug}/.
Пагинация курсором по (updatedAt, id). Все ответы через те же Zod-схемы, что
и OpenAPI. Тесты на фильтры и статусы.
```

## Промпт 1.4. Убрать конфликтную машинерию

```
[преамбула]

Бюджет: 30 шагов. Это удаление, поэтому перед удалением каждого символа найди всех вызывающих (git grep -n -w).

Убрать из service.ts, worker.ts, contract.ts, routes.ts, errors.ts:
manualRevision, manualEditsPending, acknowledgedManualRevisionId,
latestManualRevision, remote, expectedRemoteHash, коды remote_edit_conflict,
branch_busy, path_conflict, проверки по файлам isPublishedFile (service.ts:86-96)
и slug_conflict через existsSync (service.ts:258-260). Вместо файловых проверок:
relatedSlugs проверяются по content_articles (lang совпадает, publishedVersion
не null); занятость slug только по БД.

ВАЖНО: пока файлы постов живы, relatedSlugs на старые статьи (которых ещё нет
в БД) должны проходить проверку. Сделай временный фолбэк: если slug не найден в
БД, проверить файл на диске, и пометь это TODO(cutover) с ссылкой на план.
Фолбэк удаляется в промпте 3.6.

commitArticle и readRemoteArticle из github.ts пока НЕ удалять: воркер ещё
коммитит в git до этапа 2. Удали только ветки, зависящие от base_remote_hash.

Триггер content_guard_manual_revision (drizzle/0007) пока остаётся, потому что
post_revisions живы; запиши в spec, что он уходит в миграции B.

Обнови tests/integration/content-api.test.ts и tests/unit/content-api/*: тесты
на удалённые коды убрать, тесты на expectedVersion и publication_in_progress
оставить и расширить (гонка двух писателей даёт ровно один 409).
```

## Промпт 1.5. Запись

```
[преамбула]

Бюджет: 40 шагов.

1. Каждый createArticle/updateArticle/restore/translate пишет строку в
   content_article_versions с actor из Principal.
2. POST /articles/{id}/versions/{n}/restore/ {expectedVersion}: новая версия со
   старым документом.
3. DELETE /articles/{id}/ с If-Match: только если publishedVersion is null,
   иначе 409 unpublish_first.
4. POST /articles/{id}/unpublish/ {expectedVersion}: публикация kind=unpublish.
   Воркер в этом этапе для unpublish удаляет файл через GitHub (как сейчас
   удаление в админке, но через commit), в этапе 2 это заменится на dispatch.
5. POST /publish/ {items:[{id, expectedVersion}]}: одна публикация на элемент,
   общий batch_id, проверка, что все элементы одной пары slug.
6. PATCH /posts-meta/{slug}/ {pinned?, hiddenFromList?} и PUT /posts-meta/order/
   {slugs}: переиспользовать логику reorderMeta из tests/integration/cms.test.ts
   и src/lib/db/repo/posts-meta.ts.
7. GET/POST/DELETE /keys/ только для сессии: обёртка над логикой
   scripts/content-api-key.ts, полный токен в ответе один раз.
8. Упрощение контракта: externalId default = slug, provenance.agent default =
   имя ключа (для сессии 'admin'), cover.url допускается для путей /uploads/*
   и абсолютных https. sources.min(1) остаётся для обычных ключей.
9. Статус в articleView по правилам из промпта 1.3.
10. searchVector в posts_meta считается по slug без языка (worker.ts, шаг
    published), RU и EN перезаписывают друг друга: побеждает тот двойник,
    который проверен последним. Хранить вектор на каждый язык (отдельная
    колонка или строка на (slug, lang)), поиск /blog и /en/blog читает свой.
    Найдено critic в этапе 0.
Тесты на каждый пункт, в том числе: удаление черновика ок, опубликованной 409;
restore даёт version+1; pin/hide сразу меняют SSR-список (/blog).
```

## Промпт 1.6. Перевод через API

```
[преамбула]

Бюджет: 35 шагов. Это новое место вызова LLM: запиши его в CLAUDE.md в раздел
Judgment-only до написания кода (src/lib/content-api/translate-article.ts,
модель та же, что в src/lib/translate/claude.ts).

1. src/lib/content-api/translate-article.ts: берёт document RU из БД, через
   extractProse/translateProse/translateStrings из src/lib/translate/*
   переводит title, description, summary, keywords, faq, body; прогоняет
   validate-structure и validate-lengths; sources, tags, cover, socialImage,
   relatedSlugs копируются (relatedSlugs фильтруются по существующим EN);
   создаёт или обновляет EN-статью с тем же slug и externalId как draft,
   source_version = version RU. Если у EN manually_edited=true и нет force,
   возвращает 409 translation_protected.
2. Промпт перевода: добавь правило «фрагмент, который уже на английском
   (цитата из документации), возвращать дословно» и глоссарий из
   src/i18n/tags.en.json плюс 20 терминов проекта (вынеси в
   src/lib/translate/glossary.ts).
3. Разбиение плейсхолдеров на пачки по ~3000 токенов исходника, чтобы
   max_tokens 16384 не был потолком (сейчас весь пост одним запросом,
   claude.ts:78-98).
4. POST /articles/{id}/translate/ {targetLang:'en', force?}, скоуп
   articles:write.
5. Тесты с msw-фикстурами как в tests/fixtures/anthropic: code-блоки,
   mermaid и LaTeX байт-идентичны, asset-ссылки сохранены, длины в лимитах,
   stale считается верно, manually_edited защищает без force.
```

## Промпт 1.7. Социальный слой и хуки воркера

```
[преамбула]

Бюджет: 35 шагов.

1. Перенеси логику из src/actions/socialDrafts.ts в src/lib/social/service.ts:
   kickoffSocial({slug, channels?, actor}), publishDraft, saveDraft, skipDraft,
   recheckDraft, regenerate. Без ActionAPIContext и assertAdmin. Astro Actions
   в socialDrafts.ts становятся тонкими обёртками (их удалим в этапе 3 вместе
   с переводом DraftCard на API).
2. src/actions/_social.ts: loadArticle читает RU-документ из content_articles,
   если статьи там нет, временный фолбэк на файл (TODO(cutover)). hasEnTwin =
   en.publishedVersion != null (с тем же фолбэком).
3. Защита от повтора kickoff покaнальная: сейчас socialDrafts.ts:139-145 при
   любой нетерминальной строке возвращает channels:[], и при публикации EN
   позже RU каналы x_en и li_en никогда не создаются. Тест на этот случай.
4. worker.ts: после published, при hooks_done_at IS NULL, в следующем вызове
   выполнить pingIndexNow(publishedUrlsFor(...)) из src/lib/seo/indexnow.ts и
   kickoffSocial (если SOCIAL_DRAFTS_ENABLED). Ошибка хука логируется pino,
   повтор до 3 раз, публикацию не валит. Тест: хуки ровно один раз.
5. Эндпоинты GET /social/?slug&status, POST /social/generate/,
   PUT /social/{id}/, POST /social/{id}/publish/, /skip/, /recheck/ со
   скоупами social:read, social:write, social:publish (добавить в scopeSchema).
   Правило block критика без force соблюдается.
```

## Промпт 1.8. Export

```
[преамбула]

Бюджет: 25 шагов.

1. GET /api/v1/export/ со скоупом content:export (добавить в scopeSchema).
   Для каждой статьи с build_publication_id not null: {slug, lang, revision
   (= id публикации), content (= content_publications.content той публикации),
   contentSha256, meta: {order, pinned, hiddenFromList} из posts_meta}. Плюс
   snapshotId (uuid), generatedAt, count. Черновики и unpublished не попадают.
   Ответ может быть большим: стримить или хотя бы не держать два копии в памяти.
2. Воркер при переводе задачи из queued в publishing выставляет
   build_publication_id = job.id в той же транзакции; при failed откатывает на
   последнюю публикацию в состоянии published (или null, если её не было).
   Пока воркер ещё коммитит в git (этап 2 заменит), это не меняет поведение
   сайта, только готовит данные.
3. scripts/content-api-key.ts: уметь выпускать ключ только с content:export.
4. Тест: export отдаёт ожидающую версию, а не publishedContent; после failed
   отдаёт предыдущую; черновик не отдаёт.
5. docs/content-api.md: раздел Export.
```

## Промпт 1.9. Редакционные гейты в validateDocument

```
[преамбула]

Бюджет: 30 шагов.

1. src/lib/content-api/editorial.ts с чистыми функциями проверки:
   - wordCountWithoutCode(body) >= EDITORIAL_LIMITS.minWords (1200, в limits.ts);
   - sources.length >= 3 для publish;
   - минимум 2 внутренние ссылки (/blog/, /en/blog/, /courses/) в теле или
     relatedSlugs.length >= 2;
   - title уникален среди статей того же языка и не совпадает с H2 других
     статей (данные из БД);
   - у каждого ![...](asset:...) непустой alt;
   - у каждого блока ```mermaid есть accTitle и accDescr;
   - cover задан и не заглушка, ширина ассета >= 1200;
   - запрещённые фразы из src/lib/social/voice/banned-phrases.json и список
     §4.11 из .claude/skills/new-blog-post/SKILL.md (вынести в общий json);
   - спекулятивный голос: «я планирую», «возможно я» и т.п. из
     src/lib/content-api/editorial-rules.md.
2. validateDocument возвращает это как warnings при mode=draft и errors при
   mode=publish и в POST /publish/.
3. POST /articles/{id}/review/: критик статьи по образцу src/lib/social/critic.ts
   (Sonnet, read-only, JSON с notes {severity: block|warn, quote, reason}).
   Это ещё одно место вызова LLM: запиши в CLAUDE.md Judgment-only.
   Publish при наличии block без force=true даёт 409 editorial_block.
4. Unit-тесты на каждую проверку с положительным и отрицательным примером.
```

## Промпт 1.10. OpenAPI, документация, PR

```
[преамбула]

Бюджет: 15 шагов.

1. Регенерируй docs/api/openapi.json и docs/api/article.schema.json из
   обновлённых Zod-схем (scripts/content-contract.ts), обнови
   docs/api/article.example.json.
2. docs/content-api.md: разделы про сессионный доступ, список, версии,
   translate, publish batch, unpublish, social, export, редакционные гейты.
   Убери абзацы про manualRevision и remote_edit_conflict.
3. pnpm content:smoke против собранного сервера.
4. Полный прогон: pnpm lint, typecheck, test, test:db, verify:seo-build,
   test:built.
5. Открой PR feat/content-api-single-writer -> main с описанием по разделам
   плана. Старый путь публикации должен работать без изменений: проверь
   publish.one из админки на тестовом посте.
```

---

# Этап 2. Сборка из снапшота и CI-гейты (недели 4-5, ветка `feat/content-snapshot-build`)

Можно начинать после слияния промпта 1.8 (export) в main или поверх ветки этапа 1.

## Промпт 2.1. Loader

```
[преамбула]

Бюджет: 40 шагов. Сначала прочитай spec спайка из промпта 0.1.

1. tests/fixtures/content-snapshot.json: 6 синтетических статей в формате export
   (RU с math, RU с mermaid, пара RU/EN с обложкой, только RU, скрытая
   hiddenFromList, EN без RU быть не должно). Тела валидны по contract.ts.
2. src/lib/content/articles-loader.ts: объектный loader {name, load, schema}.
   load читает CONTENT_SNAPSHOT (путь), парсит, для каждой статьи:
   parseFrontmatter (из content), parseData по той же схеме, что в
   content.config.ts, renderMarkdown(content): документ ЦЕЛИКОМ, с YAML-шапкой.
   В Astro 7.3.1 у renderMarkdown нет опции frontmatter, он разбирает шапку из
   самой строки; строка без шапки даёт пустой frontmatter, и
   strip-frontmatter-duplicates молча перестаёт убирать H1 и лид (см.
   docs/specs/2026-10-03-render-markdown-spike.md). pipeline.ts не
   нужен: спайк подтвердил, что renderMarkdown уважает markdown.processor.
   store.set({id: lang === 'en' ?
   `en/${slug}` : slug, data, body, rendered, digest: contentSha256}).
   Предохранители: count === 0 или count < значения в content-manifest.json
   (новый файл в корне, {minArticles: N}) бросают ошибку с понятным текстом.
   meta из снапшота кладётся в data (поле _meta) и используется
   src/lib/content/loader.ts вместо fallbackMetaForBuild, когда нет DATABASE_URL.
3. content.config.ts: posts = defineCollection({loader: articlesLoader(),
   schema}), lang обязателен.
4. package.json: content:pull (scripts/fetch-content-snapshot.ts с
   CONTENT_EXPORT_TOKEN в .env, пишет .content/snapshot.json), CONTENT_SNAPSHOT
   по умолчанию указывает на фикстуру в dev и typecheck.
5. astro.config.ts: в dev refreshContent при изменении файла снапшота
   (astro:server:setup).
6. Контрактные тесты: формат entry.id, hasMath, mermaid SVG в rendered.html,
   strip-frontmatter-duplicates сработал, предохранители срабатывают.
7. Сборка на фикстуре проходит pnpm verify:seo-build.
Файлы src/content/posts пока остаются в репо, но loader их больше не читает.
```

## Промпт 2.2. Снапшот в CI и Docker

```
[преамбула]

Бюджет: 35 шагов.

1. scripts/fetch-content-snapshot.ts: GET /api/v1/export/ с токеном из env,
   3 ретрая с паузой, проверка Zod-схемы ответа, проверка count >= минимума из
   content-manifest.json (уменьшение разрешено только с флагом --allow-removal),
   запись в путь из аргумента, вывод snapshotId.
2. scripts/verify-content-build.ts: по снапшоту и dist/client проверяет, что
   для каждой статьи есть {en/}blog/<slug>/index.html с
   data-content-revision="<revision>", что URL есть в sitemap-<lang>.xml, что
   скрытых нет в sitemap. Падает с перечислением расхождений.
3. .github/workflows/ci.yml: job snapshot (только на push в main и
   repository_dispatch; на pull_request используется фикстура) с
   secrets.CONTENT_EXPORT_TOKEN, upload-artifact content-snapshot. Job validate
   скачивает артефакт и собирает на нём. Копия снапшота в S3
   snapshots/<id>.json через aws cli с теми же CONTENT_S3_* секретами.
4. docker-publish.yml: build-and-push берёт артефакт и кладёт
   content-snapshot.json в build context; build-arg CONTENT_SNAPSHOT_ID;
   второй тег образа content-<snapshotId>. concurrency в workflow уже есть
   (group: release-${{ github.ref }}, cancel-in-progress: false), и
   repository_dispatch попадает в ту же очередь, что push в main: группу не
   переименовывать.
5. Dockerfile: COPY content-snapshot.json /app/.content/snapshot.json, ENV
   CONTENT_SNAPSHOT, ARG CONTENT_SNAPSHOT_ID -> ENV, после pnpm build запуск
   verify-content-build.ts. Удалить COPY src/content/posts (строка 55).
   src/pages/api/version.ts отдаёт contentSnapshotId.
6. scripts/backfill-prod.mjs и его вызов в docker-entrypoint.sh удалить:
   без каталога постов он роняет старт контейнера. posts_meta создают воркер
   (уже) и импорт (этап 3). Проверь, что migrate-prod.mjs остаётся.
7. Тестов на текст workflow не писать: tests/unit/ci-workflow.test.ts и
   deploy-gate.test.ts в main удалены, а .claude/hooks/test-guard.sh
   запрещает тесты, читающие YAML. Порядок шагов проверяет сам CI.
8. Открытые вопросы, на которых надо остановиться: Cloudflare перед сайтом
   (раннеры GitHub должны доходить до export), секрет CONTENT_EXPORT_TOKEN
   добавляет Артём руками.
```

Отклонения при выполнении (2026-10-05):

- Пункт 1: флага `--allow-removal` нет. Пол только из `content-manifest.json`, понижается коммитом: при `repository_dispatch` нет предыдущего значения для сравнения, а обычное снятие с публикации не должно блокировать релиз.
- Пункт 3: копия снапшота в S3 отложена. Настроенный бакет публичный (медиа), архив сделал бы статьи `hiddenFromList` перечислимыми и добавил бы в CI ключ на запись. Артефакт `content-snapshot` живёт 7 дней. Снапшот скачивает job `build` в ci.yml (не `validate`); id тега берётся из скачанного файла, а не из outputs workflow. Секреты в `validate` передаются явно (только `CONTENT_EXPORT_TOKEN`), не `inherit`.
- Пункт 3: job `snapshot` идёт на любом событии, кроме pull_request (в т.ч. теги `v*` и `workflow_dispatch`), а не только на push в main и `repository_dispatch`: релиз по тегу тоже собирается из реального контента.
- Пункт 4: тег `content-<id>` только на ветке по умолчанию (изменяемый); сборка падает, если id равен id фикстуры.
- Пункты 5-6: `COPY src/content/posts` (в Dockerfile строка 58 в HEAD, сейчас 67; не 55), `backfill-prod.mjs` и его вызов в entrypoint остаются до 3.6, пока живы рантайм-читатели файлов. Снапшот лежит в `/app/content-snapshot.json` (builder), в runner не копируется.
- Пункт 8: Cloudflare не используется, A-запись указывает на VPS, раннеры GitHub доходят до export напрямую.
- Дополнительно: HEALTHCHECK переведён на `/api/version/` (экономит редирект 301).

## Промпт 2.3. Тесты и e2e на фикстуру

```
[преамбула]

Бюджет: 40 шагов.

Перевести все тесты, которые читают src/content/posts или завязаны на реальные
slug, на фикстуру tests/fixtures/content-snapshot.json или сид БД:
- tests/unit/posts-h1.test.ts, tests/unit/content/schema.test.ts,
  tests/unit/seo/media-output.test.ts:21, tests/unit/seo/landing-content.test.ts,
  tests/unit/i18n/counterpart-honesty.test.ts, tests/unit/content-api/github.test.ts,
  tests/unit/actions/_social.test.ts, tests/integration/publish.no-op-social.test.ts,
  tests/unit/content/post-io.test.ts, loader.test.ts;
- scripts/content-api-smoke.ts:60-64 пишет фикстуры в src/content/posts:
  переделать на запись в файл снапшота;
- e2e: tests/e2e/global-setup.ts копирует e2e-ru-only.md в каталог постов,
  tests/e2e/mobile-toc.spec.ts:14-16 дописывает в РЕАЛЬНЫЙ пост
  robots-txt-ai-crawlers-2026.md (это надо убрать в любом случае),
  admin-create/edit/delete и admin-media проверяют файл на диске через
  helpers/admin.ts:100-112. Переписать на сид content_articles через API с
  сессией и проверку через GET /articles/by-slug/.
Условие: pnpm test, pnpm test:db, pnpm test:built (после сборки) и
pnpm test:e2e зелёные при CONTENT_SNAPSHOT=фикстура и
пустом src/content/posts (временно переименуй каталог для проверки, верни).
```

## Промпт 2.4. Воркер: dispatch вместо коммита

```
[преамбула]

Бюджет: 30 шагов.

1. src/lib/content-api/github.ts -> rebuild.ts (~40 строк): requestRebuild
   (batchId) делает POST /repos/{owner}/{repo}/dispatches с event_type
   content-publish и client_payload {batchId, snapshotHint}. Ретраи как у
   текущего клиента. commitArticle, readRemoteArticle, articlePath удалить
   (сначала git grep -n -w по каждому!).
2. worker.ts, шаг queued: вместо commitArticle выставить build_publication_id
   (уже из 1.8) и вызвать requestRebuild один раз на batch (debounce: если
   другая задача того же batch уже dispatched_at в последние 120 с, не слать).
   Состояние publishing, dispatched_at.
3. Шаг publishing без изменений (verifyPublication по data-content-revision,
   HEAD картинок, sitemap), плюс сравнение contentSnapshotId в /api/version с
   ожидаемым (воркер узнаёт snapshotId из... нет, он его не знает заранее;
   достаточно проверять, что contentSnapshotId изменился после dispatched_at).
   Для kind=unpublish обратная проверка: 404 и нет в sitemap.
4. Таймаут 30 минут, при failed откат build_publication_id (из 1.8) и новый
   dispatch при повторе.
5. Тесты (слой db, tests/integration; тестов на YAML workflow не писать, их
   запрещает test-guard.sh): один dispatch на batch; падение после dispatch не ломает публикацию;
   таймаут ведёт в failed; unpublish проверяется по 404; отзыв ключа до
   dispatch останавливает публикацию.
6. .env.example: убрать GITHUB_DEFAULT_BRANCH из обязательных для API, оставить
   GITHUB_PAT (нужен для dispatch и для publish.one site). Проверить права PAT:
   Contents: write. Это открытый вопрос, спроси.
```

Отклонения при выполнении (2026-10-05):

- Пункт 3 (S0): воркер не сверяет `contentSnapshotId` из `/api/version`. Проверка остаётся прежней: `data-content-revision === job.id` плюс картинки и sitemap для publish, 404 и отсутствие в sitemap для unpublish. Ожидаемый id знает только post-deploy job, ожидание `contentSnapshotId` переезжает в промпт 2.6. `builtAt > dispatched_at` ненадёжно: на push `BUILT_AT` равен `head_commit.timestamp`.
- Пункт 2: dispatch вынесен из шага `queued` в отдельный шаг (`publishing` с `dispatched_at IS NULL`). Шаг `queued` переставляет указатель и не ходит в GitHub: указатель закоммичен до запроса, а потерянный ответ даёт только повторный (безвредный) dispatch. Из-за этого каждая публикация на один тик (около 5 с) длиннее.
- Пункт 2: debounce детерминированный, без окна в 120 с. Batch шлёт один dispatch, когда ни один член не в `queued` и ни у одного соседа нет `dispatched_at`; член, чей сосед уже отправил dispatch, берёт его `dispatched_at` без нового вызова. Таймаут в 30 минут считается от `dispatched_at`.
- Пункт 1: `requestRebuild` на голом `fetch`, без ретраев; статус кроме 204 это ошибка (429 и 5xx: `503 rebuild_unavailable`, остальное: `502 rebuild_rejected`, никогда 403: воркер считает 403 постоянным `key_revoked`). `snapshotHint` убран: воркер его не знает. `github.ts` удалён целиком (`articleUrl` в `urls.ts`, `fetchWithDeadline` в `rebuild.ts`, приватный `articlePath` в `service.ts` ради `fileOwnsSlug` с `TODO(cutover)`).
- Cleanup на 3.6: `src/lib/git/github-publisher.ts` (`publish.one`) теперь единственный пользователь Octokit (`@octokit/rest`); пока он жив, в проекте два способа ходить в GitHub (`fetch` в `rebuild.ts` и Octokit). Убрать вместе с ним и зависимость.
- `mayBeInBuild` (бывший `ownsCommittedFile`) консервативное: publish учитывается, если он хоть раз покинул `queued` (`state !== "queued"`) или есть унаследованный `commitSha`; unpublish учитывается при `state = published`; решает самое новое. Причина: указатель сборки переставляется в шаге `queued`, и любая сборка до dispatch (чужой dispatch, push) может выкатить страницу. Принятое ложное срабатывание: publish, упавший ещё в `queued` (`cover_unreachable`, `key_revoked`, `version_conflict`), тоже считается, и `DELETE` отвечает `409 unpublish_first`, а `unpublish` не отвечает `not_published`; рычаг: unpublish, затем delete.
- Условия выкладки 2.4 (иначе каждая публикация получит 204 и через 30 минут `deployment_timeout`, громко упасть нечему): (1) 2.2 смержен в main (триггер `repository_dispatch: types: [content-publish]` читается только с ветки по умолчанию); (2) секрет `CONTENT_EXPORT_TOKEN` задан; (3) prod `GITHUB_PAT` проверен на `POST /dispatches` (Contents: write; локальный PAT 2026-10-05 ответил 204 на пробный event_type, prod не проверен); (4) в export число статей не ниже пола (`minArticles`, импорт старых постов, промпт 3.1): иначе снятие статьи роняет snapshot job и воркер через 30 минут уходит в `deployment_timeout` (G8).
- Открытое: задание, упавшее после того как страница уже ушла live (например, исчерпан `sitemap_pending`), откатывает указатель без новой пересборки; рычаги: `unpublish` или повторная публикация. Автоматического dispatch при сбое нет. Таймаут 30 минут (`DEPLOY_TIMEOUT_MS`) может не хватить на validate + build + Dokploy в очереди; решить после замера p95 dispatch до live.

## Промпт 2.5. Расширение verify-seo-build

```
[преамбула]

Бюджет: 45 шагов. Самый важный промпт этапа.

Расширь scripts/verify-seo-build.ts (или разбей на модули в scripts/seo-checks/)
проверками по dist на реальном снапшоте. Каждая проверка это функция с
понятным сообщением об ошибке и списком URL.

1. JSON-LD: Zod-схема для BlogPosting (headline, datePublished, dateModified,
   author -> Person с url или sameAs, image, inLanguage, url === canonical
   страницы, mainEntityOfPage), Person, Organization, WebSite, BreadcrumbList,
   Blog. Используй типы schema-dts в src/lib/seo/graph-types.ts для
   генератора. Висячие @id уже проверяются, оставить.
2. hreflang: для каждой страницы с alternate проверить взаимность (RU ссылается
   на EN и наоборот), self-reference, x-default, что canonical каждой версии
   указывает на себя, что страница без двойника не отдаёт alternate на 404.
3. Sitemap: xmllint --noout на всех sitemap-*.xml; каждый <loc> имеет файл в
   dist; lastmod равен dateModified страницы; скрытых и draft нет.
4. Картинки: у каждого <img> в .prose alt, width, height, формат из
   {webp, avif, png, jpg, svg, gif}; og:image существует (локально или по
   HEAD для S3) и не меньше 1200x630 (image-size); twitter:card =
   summary_large_image; meta robots содержит max-image-preview:large на
   индексируемых; обложка поста шире 1200 px.
5. SVG/Mermaid: нет <pre class="mermaid"> и подключения mermaid.js; каждый SVG
   из data-URI парсится xmllint и имеет <title> или aria-label; обёрнут в
   figure.diagram с figcaption.
6. Маркер: data-content-revision есть на каждой странице поста (дублирует
   verify-content-build, оставить одну реализацию и вызывать из обоих мест).
7. Подключи html-validate (конфиг .htmlvalidate.json с wcag/h37, no-dup-id,
   heading-level, long-title) по dist/client/**/*.html и lychee в офлайн-режиме
   по dist (внутренние ссылки и якоря). Если lychee офлайн не умеет, linkinator.
8. Добавь шаг Unlighthouse (unlighthouse-ci --site http://localhost:4321
   --budget) на main и repository_dispatch после production-smoke; на PR
   только 3 URL (главная, пост RU, пост EN) с бюджетами SEO 100, a11y 95,
   performance 85. Если Unlighthouse не держит пороги, lhci с
   lighthouse:recommended.
9. Тесты на сами проверки: искусственно сломанный JSON-LD, отсутствующий
   обратный hreflang, SVG без title, img без alt должны ронять скрипт.
10. ci.yml: порядок шагов как в плане (translate:check, build, verify, html,
    links, unit, smoke, e2e, lighthouse).
```

## Промпт 2.6. Post-deploy smoke и IndexNow после выкладки

```
[преамбула]

Бюджет: 25 шагов.

1. scripts/post-deploy-smoke.ts: ждёт, пока https://artka.dev/api/version
   отдаст ожидаемый contentSnapshotId (аргумент, до 15 минут); для каждого URL
   из снапшота (или только из batch, если передан): 200, data-content-revision,
   canonical на боевом хосте, парный hreflang, JSON-LD парсится, og:image и
   картинки тела отвечают 200, URL в sitemap, нет noindex. Отчёт в stdout и
   ненулевой код при любом расхождении. /api/version читать по телу, а не по
   response.ok: с этапа 0 он отвечает 503 при молчащем воркере, и это не
   значит «выкладки не было».
2. docker-publish.yml: job post-deploy после шага Dokploy: smoke, затем
   IndexNow (src/lib/seo/indexnow.ts как CLI) только для URL batch, затем
   Search Console sitemaps.submit через googleapis с сервисным аккаунтом
   (секрет GSC_SERVICE_ACCOUNT_JSON; это открытый вопрос, спроси, если
   секрета нет, шаг пропускается с warning).
3. Воркер: хук IndexNow из 1.7 оставить как резерв, но он должен выполняться
   только если job post-deploy не отправил (идемпотентно: IndexNow терпит
   повтор).
4. docs/runbooks/post-deploy-smoke.md: как читать отчёт, что делать при
   падении.
```

## Промпт 2.7. Сверка HTML и PR

```
[преамбула]

Бюджет: 20 шагов.

1. Собери сайт двумя способами: (а) из файлов на коммите main до этой ветки,
   (б) из снапшота, полученного импортом тех же 14 страниц (используй
   scripts/import-legacy-posts.ts из промпта 3.1 в dry-run режиме в локальную
   БД; если 3.1 ещё нет, сделай минимальный конвертер файл -> формат export
   в scripts/dev/files-to-snapshot.ts).
2. Сравни HTML 14 страниц постов, sitemap-ru/en, RSS, feed.json, llms.txt,
   llms-full.txt, игнорируя data-content-revision и generatedAt. Расхождения
   объясни по одному: что из них допустимо (например порядок атрибутов), что
   нет (другое экранирование, пропавшие «Источники», другой wordCount).
3. Исправь недопустимые расхождения на стороне serializeArticle или loader.
4. PR feat/content-snapshot-build -> main с отчётом сверки.
```

---

# Этап 3. Cutover, MCP, скиллы (неделя 6, ветка `feat/api-only-cutover`)

Только после слияния этапов 1 и 2 в main и успешного деплоя.

## Промпт 3.1. Импорт старых постов

```
[преамбула]

Бюджет: 35 шагов. Сначала спроси: статья custom-domain-email-mailu-dokploy в
content_articles на проде, и совпадает ли её publishedContent с файлом? Судьба
черновика claude.md?

1. POST /articles/import/ {article, firstPublishedAt, lastModifiedAt?} со
   скоупом articles:import (только CLI-ключ legacy-import): пишет статью с
   version=1, publishedVersion=1, publishedContent и build_publication_id
   на синтетическую публикацию в состоянии published (страница уже живая).
   Для provenance.agent='import' допускается sources.min(0).
2. scripts/import-legacy-posts.ts: для каждого файла в src/content/posts
   (кроме claude.md и Mailu): разобрать frontmatter через parseFrontmatter,
   перенести раздел «Источники» (H2 или жирный абзац) из тела в sources[],
   cover /og-default.png не задавать, firstPublishedAt = pubDate,
   lastModifiedAt = updatedDate, manually_edited из EN-frontmatter,
   externalId = legacy:<slug>, baseManualRevisionId не нужен. Dry-run режим
   печатает документы без записи.
3. Прогнать против локальной БД, собрать сайт из export и сверить HTML с
   файловой сборкой (как в 2.7). Исправить расхождения в конвертере.
4. Прогнать против прода (с бэкапом БД до). Проверить export: count = 13
   (6 пар + Mailu пара), sitemap без изменений.
```

## Промпт 3.2. Переключение и две реальные публикации

```
[преамбула]

Бюджет: 25 шагов. Этот шаг делается вместе с Артёмом в реальном времени.

1. Убедись, что на проде export отдаёт все статьи и CI на main собирает из
   снапшота (промпт 2.2 уже в main). Запусти workflow_dispatch, дождись
   деплоя, прогони post-deploy smoke на всех URL.
2. Через API (сессия админа или ключ publisher) опубликуй небольшую правку в
   одной существующей статье (например обновлённый абзац) парой RU+EN через
   POST /publish/. Дождись published. Проверь на проде маркер, lastmod,
   IndexNow в логах.
3. Опубликуй новую тестовую статью (можно скрытую hiddenFromList) и затем
   unpublish. Проверь 404 и отсутствие в sitemap.
4. Запиши в docs/runbooks/api-only-cutover.md что было сделано, с временными
   метками и временем цикла publish -> published.
```

## Промпт 3.3. MCP-сервер

```
[преамбула]

Бюджет: 40 шагов. Открытый вопрос: точная версия @modelcontextprotocol SDK v2
(пакеты @modelcontextprotocol/server) в npm и совместимость с Claude Code на
десктопе. Проверь npm view перед установкой.

1. scripts/mcp-content.ts: McpServer + StdioServerTransport. Ходит в
   CONTENT_API_BASE по HTTP с CONTENT_API_TOKEN, в БД не лезет. Zod-схемы
   входов из src/lib/content-api/contract.ts. На старте GET /whoami/ и
   регистрация только инструментов, разрешённых скоупами.
2. Инструменты (на уровне намерений, не по одному на эндпоинт):
   site_overview, list_articles, get_article, validate_article, upload_image,
   list_media, create_draft (Idempotency-Key mcp:create:{externalId}:{lang}:
   {sha16(canonicalJson)}; на 409 article_exists вернуть id и подсказку),
   update_article (на 409 version_conflict вернуть {conflict:true, current},
   без автоповтора), translate_article, publish_article (batch, wait=true,
   опрос раз в 15 с, notifications/progress при progressToken, по таймауту
   publicationId), get_publication, unpublish_article, social_list,
   social_generate, social_update, social_publish.
3. .mcp.json в корне репо: сервер artka-content через pnpm exec tsx, env
   CONTENT_API_BASE и CONTENT_API_TOKEN через ${VAR}. Без секретов в репо.
4. Тесты на mock fetch: набор инструментов зависит от скоупов; повтор
   create_draft создаёт одну статью; 409 возвращает текущий документ;
   publish_article дожидается итогового статуса.
5. docs/content-api.md раздел MCP: как выпустить ключи writer и publisher,
   как подключить в Claude Code (claude mcp add или .mcp.json).
```

## Промпт 3.4. Скиллы

```
[преамбула]

Бюджет: 30 шагов. Скилл skill-creator для структуры.

1. .claude/skills/new-blog-post/SKILL.md: редакционная часть (§2.0-2.3, §4
   стиль, §5 структура, FAQ, источники, чёрный список) без изменений.
   Меняется: артефакт drafts/<slug>.ru.json по ArticleDocument; §3 про
   frontmatter заменить на поля документа (externalId, sources[], cover
   {assetId, alt}, seo, relatedSlugs, faq); §2.3 эталонные посты через
   get_article; §2.6 заменить на: validate_article, create_draft, затем
   translate_article для текстов до 1500 слов, для длинных агент пишет EN сам
   и вызывает create_draft с тем же slug; §2.7 режим расширения через
   get_article + update_article с expectedVersion; §6 проверки длин по JSON;
   картинки через upload_image и ![alt](asset:UUID); источники только в
   sources[] (сервер сам рендерит раздел); Mermaid только с accTitle/accDescr.
   TEMPLATE.md и TEMPLATE-fields.md заменить на TEMPLATE.json.
   allowed-tools: добавить инструменты MCP artka-content.
2. Новые скиллы: publish-article (preflight: статус EN, relatedSlugs,
   warnings validate; batch publish_article; отчёт с URL; только с publisher
   ключом), social-announce (social_generate, показать драфты, правки по
   src/lib/social/voice/profile.md, social_publish после явного OK),
   seo-check (длины, ключевые фразы, структура H2, внутренние ссылки через
   list_articles; после публикации проверка живого HTML: canonical, hreflang,
   JSON-LD через curl).
3. .claude/agents/critic.md: правило «никаких записей в src/content/posts,
   только API».
4. Прогони new-blog-post на одном реальном источнике до create_draft
   включительно и приложи результат validate_article к отчёту.
```

## Промпт 3.5. Админка: inbox, список, publish bar

```
[преамбула]

Бюджет: 45 шагов. designer перед новыми экранами (постерная система,
.claude/skills/ui-design-review).

1. src/lib/admin/api-client.ts (~80 строк): fetch в /api/v1 с cookie,
   Idempotency-Key = crypto.randomUUID() на действие, разбор 409
   version_conflict (диалог «перечитать и показать diff» через RevisionDiff)
   и 422 details по полям.
2. /admin/posts: список через GET /articles/ с фильтрами lang, статус, агент;
   pin/hide/reorder через posts-meta; удаление только черновиков, для
   опубликованных кнопка Unpublish.
3. /admin/inbox: драфты агентов (status=draft, provenance.agent != admin):
   превью через POST /articles/preview/ (новый эндпоинт: рендер markdown в
   HTML тем же pipeline, Mermaid остаётся кодом), кнопки Publish (batch RU+EN),
   Translate, Delete.
4. ArticlePublishBar: batch publish, опрос /publications/{id} раз в 15 с,
   статусы queued / publishing (со ссылкой на Actions run) / published /
   failed с error. Никаких «2-3 минуты».
5. /admin/posts/[slug]: пока только просмотр документа RU/EN и history
   (versions + RevisionDiff + restore). Полный редактор в этапе 4.
6. /admin/media на content_assets: список и загрузка сырыми байтами.
7. /admin/keys: выпуск и отзыв.
8. DraftCard в /admin/social на API-эндпоинты из 1.7; Astro Actions
   socialDrafts.ts удалить.
9. e2e: создание через API, одобрение в inbox, publish с замоканным dispatch.
```

## Промпт 3.6. Удаление старого пути и миграция B

```
[преамбула]

Бюджет: 40 шагов. git grep -n -w на каждый удаляемый экспорт. Удалять только
после того, как промпты 3.2 и 3.5 закрыты и прод работает из снапшота минимум
неделю.

Удалить: src/actions/posts.ts (+ posts.upsert.test.ts), src/actions/revisions.ts,
src/actions/media.ts, src/lib/fs/media-writer.ts (+ тест), src/lib/content/
post-io.ts (+ тест), src/lib/content/frontmatter.ts (+ тест; импорт его больше
не использует), src/lib/db/repo/revisions.ts, repo/media.ts,
src/lib/search/pagefind-rebuild.ts (+ тест), scripts/backfill-posts-meta.ts,
backfill-search-vector.ts, scripts/refresh-en-sourcehash.ts (если ещё есть),
tests/unit/actions/revisions.restore.test.ts, tests/integration/actions/
publish.no-op-social.test.ts, tests/integration/cms.test.ts (кроме reorderMeta,
перенести), src/pages/admin/revisions/[slug].astro, ветка posts в
src/actions/publish.ts и src/actions/translate.ts, ветка posts в
scripts/translate.ts и translate-check.ts, временные фолбэки TODO(cutover) из
промптов 1.4 и 1.7, каталог src/content/posts целиком, фикстура
tests/e2e/fixtures/e2e-ru-only.md.

НЕ удалять: src/lib/fs/post-writer.ts (его использует site-io), git/
github-publisher.ts (site и home), PublishBar (site и home), translate.ts и
translate-check.ts для site/projects/courses.

Миграция B: drop post_revisions и триггер prune_post_revisions (0002), триггер
content_guard_manual_revision (0007), media_assets, колонки
base_manual_revision_id, base_remote_hash, commit_sha. Dockerfile: убрать
VOLUME uploads и UPLOADS_DIR, docker-entrypoint без backfill. Runbook
docs/runbooks/dokploy-uploads-volume.md пометить устаревшим.

Проверка: pnpm lint, typecheck, test, test:db, test:built, test:e2e,
verify:seo-build на фикстуре и
на прод-снапшоте; pnpm translate:check зелёный без постов.
```

## Промпт 3.7. Документация

```
[преамбула]

Бюджет: 15 шагов.

Обнови CLAUDE.md: разделы «Структура» (постов в src/content нет, источник
Postgres, снапшот), «Команды» (content:pull, mcp), «i18n» (посты переводятся
через API, translate для site/projects/courses), «Judgment-only» (три новых
места: translate-article, review, generate-cover если уже есть), «Деплой»
(repository_dispatch, снапшот, теги образа, нет тома uploads), «Запреты»
(писать в src/content/posts). README: раздел «Публикация статьи» на MCP и
админку. docs/content-api.md финальная версия. Удали или пометь устаревшими
docs/specs/plans/2026-05-10-admin-post-editor-frontmatter-fix-handoff.md,
2026-05-10-translate-pipeline-length-validation.md,
docs/runbooks/dokploy-uploads-volume.md. .claude/skills/generated/* обновить
вручную под новые пути.
```

---

# Этап 4. Иллюстрации, полная админка, обратная связь (недели 7-9)

Промпты этого этапа пишутся после закрытия этапа 3, когда станут известны ответы на открытые вопросы (провайдер картинок, OAuth соцсетей, сервисный аккаунт GSC). Состав по плану: POST /media/generate/ с постерным style-prompt и IPTC-меткой, скилл illustrate, критик статей как обязательный гейт, полный ArticleEditor, соцпубликация по API и автопубликация после трёх недель без правок, таблицы content_ideas и content_metrics (URL Inspection API раз в сутки, web-vitals beacon), Streamable HTTP MCP с OAuth для коннектора claude.ai.

---

## Чего эти промпты сознательно не делают

- Не переводят site, projects и courses в API. Это повтор той же схемы позже.
- Не вводят SSR статей из БД и live collections: без готового HTML до выкладки нечего проверять на CI.
- Не включают автопубликацию в соцсети: только драфты и ручное подтверждение по каналам.
- Не используют Google Indexing API и ping sitemap: первое запрещено для блогов, второе отключено.
- Не делают FAQPage обязательным гейтом: Google не показывает FAQ rich results с мая 2026, разметка остаётся как есть.
