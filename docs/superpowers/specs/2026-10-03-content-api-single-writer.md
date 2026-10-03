# Content API как единственный писатель: решения этапа 1

Дата: 3 октября 2026
План: `docs/superpowers/plans/2026-10-03-api-only-migration.md`
Ранбук: `docs/runbooks/api-only-agent-prompts.md`, промпты 1.1–1.10

Документ пополняется по мере прохождения промптов этапа 1. Здесь записаны решения, которых нет в плане, и отклонения от него.

## Схема данных (миграция A, `drizzle/0008_article_versions_build_pointer.sql`)

Только добавления. Старый путь публикации (файлы, админка, `publish.one`) миграция не затрагивает.

### `content_article_versions`

`(article_id, version)` первичный ключ, `document jsonb`, `actor_key_id`, `actor_user_id`, `created_at`.

- `article_id` с `ON DELETE CASCADE`: удаление черновика (промпт 1.5) убирает и его историю. Опубликованную статью удалить нельзя, так что каскад не теряет историю опубликованного.
- Открыто для промпта 1.5: `content_publications.article_id` остаётся `ON DELETE RESTRICT` (0007). У черновика с неудачной попыткой публикации есть строка публикации, и `DELETE /articles/{id}/` упрётся в FK. Удаление черновика должно сначала убрать его неуспешные публикации в той же транзакции.
- `actor_key_id` и `actor_user_id` с `ON DELETE SET NULL`: отзыв ключа или удаление пользователя не должны блокироваться историей.
- Backfill: одна строка на статью **под её текущим номером версии**, а не под номером 1, как записано в плане. Статья про Mailu на проде уже на версии 3; строка «версия 1» с документом версии 3 была бы ложью, а следующая запись `version + 1` оставила бы дыру. Более ранние документы нигде не хранились, восстановить их нельзя.

### `content_articles`

- `build_publication_id` (FK на `content_publications`, `ON DELETE SET NULL`): желаемое состояние для сборки. Backfill: последняя публикация статьи в состоянии `published`; у черновиков `NULL`.
- `last_modified_at`: `NOT NULL DEFAULT now()`, backfill из `updated_at`. Отдельно от `updated_at`, потому что `updated_at` меняется и от служебных записей.
- `source_version`: для EN, с какой версии RU сделан перевод.
- `unpublished_at`, `manually_edited` (`NOT NULL DEFAULT false`).

### `content_publications`

- `kind` (`publish` | `unpublish`, `CHECK`), `batch_id` с индексом, `dispatched_at`, `hooks_done_at`.
- Backfill `hooks_done_at = updated_at` для публикаций в состояниях `published` и `failed`. Без него воркер из промпта 1.7 отправил бы IndexNow и создал соцчерновики для всех исторических публикаций: условие хуков «`hooks_done_at IS NULL`». Активные публикации (`queued`, `publishing`) остаются с `NULL` и получат хуки после завершения.

### Системный ключ `admin-session`

Строка в `content_api_keys` с `token_hash = 'session:' + 64 нуля`. Хеш настоящего токена это 64 hex-символа sha256, поэтому совпасть с этой строкой он не может. Имя и хеш экспортируются из `src/lib/db/schema.ts` (`ADMIN_SESSION_KEY_NAME`, `ADMIN_SESSION_TOKEN_HASH`). Скоупы в строке определяют права сессии: principal берёт их из строки (промпт 1.2), а воркер проверяет `revoked_at` и `articles:publish` по той же строке. Поэтому правка или отзыв строки действуют одинаково на API и на воркер.

### Что уходит в миграции B (после cutover)

`post_revisions` с триггером `prune_post_revisions` (0002) и `content_guard_manual_revision` (0007), `media_assets`, колонки `base_manual_revision_id`, `base_remote_hash`, `commit_sha`.

### Порядок выкладки

Backfill версий и `hooks_done_at` выполняется один раз, в момент миграции. Если 0008 попадёт на прод раньше кода промптов 1.2–1.7, сохранения в этом промежутке останутся без строк версий, а публикации, завершившиеся в нём, сохранят `hooks_done_at = NULL` и получат хуки с опозданием. Этап 1 выкладывается одним PR.

Строку `admin-session` код ищет по `ADMIN_SESSION_TOKEN_HASH`, а не по имени.

### Снапшоты drizzle

`pnpm exec drizzle-kit check` перед генерацией: «Everything's fine». Сгенерированный SQL содержит только изменения этого шага; отсутствующий `0002_snapshot.json` ложного diff не дал.

## Наблюдения с прода (шаг 1.0)

- Файлы статьи про Mailu в git отличались от `publishedContent`: коммит `86843ff` (12 сентября) переформатировал их prettier'ом (кавычки в YAML, маркеры списков). Первая попытка публикации остановилась с `remote_edit_conflict`. После сверки (различия только в форматировании) публикация прошла через `expectedRemoteHash`. Это ответ на открытый вопрос плана «`publishedContent` совпадает с файлом в git?»: не совпадал.
- Вывод для импорта (этап 3): prettier в lint-staged меняет Markdown постов, поэтому сравнение «файл против БД» должно идти по разобранному документу, а не по байтам.

## Principal и маршруты (промпт 1.2)

- **Principal.** `authorize(request, locals, scope)` в `src/lib/content-api/auth.ts`. Любой непустой `Authorization` идёт прежним путём Bearer (401, 403, 429) и никогда не падает на cookie; тот же предикат `hasAuthorizationHeader` использует `requiresAuthContext`. Без заголовка берётся `locals.user`: нет пользователя 401, роль не `admin` 403, на не-GET проверка Origin, затем строка `admin-session`.
- **Строка `admin-session` ищется на каждый запрос** по `ADMIN_SESSION_TOKEN_HASH`, без кеша: id меняется, когда таблицу пересоздают (тесты). Скоупы principal берутся из строки. Строка отсутствует или отозвана: `logger.error` и 503 `admin_session_key_missing`, чтобы не принять сохранение с публикацией, которую воркер потом отклонит как `key_revoked`. Лимит 60/мин для сессии не применяется и счётчик строки не меняется.
- **Origin.** `src/lib/content-api/origin.ts`, чистая `allowedOrigins(env)`, считается на каждый вызов. Продакшн (`NODE_ENV=production`): только `CANONICAL_ORIGIN`. Иначе ещё origin из `BETTER_AUTH_URL ?? SITE_URL` (там выдан cookie). Нет ни одной переменной: остаётся только канонический origin, без исключения. Нет заголовка или `null`: 403 `origin_mismatch`. Проверка не заменяет `checkOrigin` Astro, а добавляется к нему.
- **Идемпотентность сессии.** В `content_api_requests.idempotency_key` пишется `${userId}:${key}` (колонка text, схема не меняется), потому что у всех админов один `key_id`. Для Bearer ключ не меняется.
- **Таблица маршрутов.** `src/lib/content-api/routes.ts`: `matchRoute` (чистая; `:id` один непустой сегмент; побеждает первый в порядке массива, поэтому `articles/validate` стоит перед `articles/:id`), `createDispatcher(routes)` (authorize, затем `sessionOnly`, затем handler), `once` для идемпотентных. Ключ `Idempotency-Key` читается лениво внутри `once`: плохое тело по-прежнему получает 415/422 раньше, чем 400 за отсутствующий ключ. В дайджест запроса идёт `params.path` как есть (без нормализации): на проде уже лежат дайджесты по этой строке. Публичные маршруты (`scope: null`) принципала не получают. Запись `openapi.json` в таблице недостижима на сервере (Astro отдаёт `openapi.json.ts` раньше), оставлена для вызова `ALL` напрямую.
- **Единственное намеренное изменение поведения** для существующих маршрутов: у `articles/:id` (GET, PUT), `articles/:id/publish` и `publications/:id` теперь сначала проверяются аутентификация и скоуп, потом формат id. Было 422 на неверный uuid до любой проверки; стало 401 без учётных данных и 403 без нужного скоупа. Запрос с валидным ключом и плохим uuid теперь считается в лимите 60/мин. Разбор uuid остаётся в handler, до разбора тела.
- **`/keys/*`** (промпт 1.5) помечаются `sessionOnly`: Bearer получает 403 `key_cannot_manage_keys`. До этого проверено на синтетическом маршруте в `tests/integration/content-api-session.test.ts`. Промпт 1.5 обязан скрыть строку `admin-session` из списков и запретить её отзыв.
- **Роли.** Доступ по сессии только для `admin`, как в ранбуке. `/admin` guard (`src/middleware.ts`) и `assertAdmin` (`src/actions/_auth.ts`) сегодня пускают и `editor`. Пересмотреть до этапа 3, когда админка переедет на API: иначе editor потеряет возможности.
- **Автор версии.** `authorize` отдаёт `principal.userId`; промпт, который начнёт писать `content_article_versions`, должен передавать его как `actor_user_id`. Сейчас записи делает `keyId = admin-session` без пользователя.
- **Пропущено из ревью (nit):** отдельный тест на запись `openapi.json` в таблице (недостижима на сервере).
