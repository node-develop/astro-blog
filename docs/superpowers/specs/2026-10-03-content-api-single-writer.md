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

Строка в `content_api_keys` с `token_hash = 'session:' + 64 нуля`. Хеш настоящего токена это 64 hex-символа sha256, поэтому совпасть с этой строкой он не может. Имя и хеш экспортируются из `src/lib/db/schema.ts` (`ADMIN_SESSION_KEY_NAME`, `ADMIN_SESSION_TOKEN_HASH`). Скоупы в строке носят справочный характер: principal сессии получает все скоупы в коде (промпт 1.2).

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
