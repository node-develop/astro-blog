# Content API v1

API принимает **готовые статьи**. Исследование источника, написание текста, создание изображений и переводы выполняет внешний агент. Один запрос содержит одну языковую версию.

- Base URL: `https://artka.dev/api/v1`
- [OpenAPI 3.1](api/openapi.json), [JSON Schema статьи](api/article.schema.json), [пример запроса](api/article.example.json).
- Актуальная спецификация доступна по `GET /api/v1/openapi.json`.
- Адреса операций заканчиваются на `/`: передавайте его явно, чтобы POST не попадал на редирект. Исключение — `openapi.json`.
- Формат JSON, UTF-8. Неизвестные поля отклоняются. Размер JSON-запроса — до 1 MiB, тело статьи — до 200 000 символов.

## Быстрый старт для агента

Сохраните API-ключ в секретах среды. `CONTENT_API_TOKEN` ниже — переменная клиента, сайт её не читает.

```bash
export CONTENT_API_BASE=https://artka.dev/api/v1
# CONTENT_API_TOKEN передаётся через secret manager.

# Проверить документ без сохранения.
curl --fail-with-body "$CONTENT_API_BASE/articles/validate/" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @docs/api/article.example.json

# Создать черновик. Сохраняйте этот ключ для повторов ТОГО ЖЕ запроса.
curl --fail-with-body "$CONTENT_API_BASE/articles/" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: research-content-api-example-v1' \
  --data-binary @docs/api/article.example.json
```

Чтобы сразу запустить публикацию, передайте `"mode": "publish"`. По умолчанию — `draft`. Черновики хранятся в PostgreSQL и доступны через закрытый API; публичная страница, RSS и sitemap их не содержат. Редактор админки видит статью после её публикации и развёртывания. Отдельного интерфейса для API-черновиков в v1 нет.

Успешное создание вернёт `201` для черновика или `202` для публикации:

```json
{
  "id": "<article UUID>",
  "version": 1,
  "state": "draft",
  "publishedVersion": null,
  "url": "https://artka.dev/blog/reliable-agent-publication/",
  "article": { "...": "сохранённый документ" },
  "createdAt": "2026-09-07T10:00:00.000Z",
  "updatedAt": "2026-09-07T10:00:00.000Z",
  "publication": {
    "id": "<publication UUID>",
    "state": "queued",
    "statusUrl": "/api/v1/publications/<publication UUID>/"
  },
  "warnings": []
}
```

Ответы со статьёй несут `status` (правила ниже, раздел «Чтение»). Поле `state` (`draft`/`published`) оставлено для совместимости и **устарело**: используйте `status`. Сохранённые до 1.5 идемпотентные ответы поля `status` не содержат.

Пример ответа сокращён; полный контракт полей описан в OpenAPI. У черновика `publication: null`. Поле `state` статьи относится к текущей сохранённой версии; отдельный процесс находится в `publication.state`. Во время публикации обновления старая версия страницы продолжает работать.

## Доступ по сессии администратора

Кроме Bearer-ключа API принимает cookie сессии администратора (Better-Auth). Это путь для админки; агентам нужен ключ.

- Только роль `admin`. Без сессии `401`, с другой ролью `403`.
- Любой непустой заголовок `Authorization` проверяется как Bearer-ключ и никогда не заменяется cookie: неверный токен даёт `401`, даже если рядом есть сессия.
- Запросы, кроме GET/HEAD, обязаны нести `Origin`, равный `https://artka.dev` (в разработке ещё и origin из `BETTER_AUTH_URL`/`SITE_URL`). Иначе `403 origin_mismatch`. Заголовок не проверяется на чтении.
- Лимит 60 запросов в минуту к сессии не применяется.
- Сессия действует как служебный ключ `admin-session` со скоупами из его строки в `content_api_keys`. Пока строка отсутствует или отозвана, сессионные запросы получают `503 admin_session_key_missing`: воркер так же отклоняет публикации отозванного ключа.
- `Idempotency-Key` у сессии привязан к пользователю: два администратора с одинаковым ключом не видят ответов друг друга.
- `GET /whoami/` возвращает `{kind: "key" | "session", keyName, scopes}`; запрос по ключу считается в лимите.

## Чтение

Все маршруты чтения требуют скоуп `articles:read` (в том числе `GET /media/`: агенту нужны `assetId`, чтобы сослаться на картинку, а ключ только для чтения не должен получать право загрузки). Ответы описаны в OpenAPI теми же Zod-схемами; поля не из схемы в ответ не попадают.

| Маршрут | Ответ |
| --- | --- |
| `GET /articles/?lang&status&agent&tag&q&limit&cursor` | страница статей: `id, slug, lang, title, tags, url, provenance.agent, version, publishedVersion, status, updatedAt` |
| `GET /articles/by-slug/{slug}/` | `{ru, en, translation}`; `translation` = `{sourceVersion, stale}` или `null`, если нет одной из сторон |
| `GET /articles/{id}/versions/` | `{currentVersion, items}` без документов, новые первыми |
| `GET /articles/{id}/versions/{n}/` | одна версия с документом; нет такой: `404 not_found`, `details: {version, currentVersion}` |
| `GET /publications/?articleId&state&limit&cursor` | страница публикаций с полем `kind` (`publish`/`unpublish`) |
| `GET /media/?limit&cursor` | страница загруженных изображений: `id, url, width, height, mimeType, byteSize, createdAt` |
| `GET /posts-meta/{slug}/` | `{slug, order, pinned, hiddenFromList, updatedAt}` |

**Статус статьи** (`status`), первое подходящее правило:

1. последняя публикация `queued` или `publishing` (в том числе снятие с публикации): `publishing`;
2. последняя публикация `failed`: `failed`;
3. задан `unpublished_at`: `unpublished`;
4. `publishedVersion` пуст: `draft`;
5. `version > publishedVersion`: `changed`;
6. иначе `published`.

**Пагинация.** `limit` 1..100 (по умолчанию 20). `nextCursor` непрозрачный: передавайте его без изменений; `null` значит последняя страница. Испорченный курсор и неизвестный параметр запроса дают `422 validation_error`. Статьи идут по `(updatedAt, id)` по убыванию, публикации и изображения по `(createdAt, id)`. Правка статьи во время обхода переносит её в начало списка, поэтому при обходе её можно пропустить; для надёжной сверки обходите список заново.

**Границы.** Маршруты видят только статьи, созданные через API. Файловые посты сюда не входят: `404` у `by-slug` не значит, что slug свободен (создание вернёт `409 slug_conflict`, если slug занят файлом). `stale: true` при `sourceVersion: null` значит, что версия RU-источника перевода неизвестна. История версий может иметь дыры (версии до ввода истории не восстанавливаются): отдаётся то, что есть.

## Поля статьи

Обязательные: `externalId`, `lang` (`ru`/`en`), `slug`, `title`, `description`, `summary`, `body`, `tags`, `sources`, `provenance.agent`.

- `slug`: 1–100 символов, строчные латинские буквы/цифры, слова разделены одиночными дефисами. Адрес после создания не меняется.
- `externalId`: стабильный ID материала, 1–200 символов. Совпадение возвращает `409` с ID существующей статьи. Несколько статей по одному источнику допустимы при разных externalId.
- Перевод имеет те же `externalId` и `slug`, другой `lang`. Сайт связывает существующие версии через hreflang. Автоперевода нет. CI проверяет схему EN-документа, но не требует английскую версию и совпадение sourceHash для статей с серверным apiRevision: их переводы контролирует внешний агент.
- `title`: 3–120; `description`: 10–200; `summary`: 60–280 символов.
- `tags`: 1–20 slug-значений; `keywords`: до 40 тематических фраз.
- `sources`: 1–30 объектов `{url, title}`, HTTPS. Сайт выводит ссылки в конце статьи. URL источника не становится canonical.
- `cover`: `{assetId, alt, caption?}`; `socialImage`: такой же объект, `caption` используется только для обложки. Без отдельной социальной картинки используется обложка, без обложки — штатная OG-картинка сайта.
- `seo.title`, `seo.description`: необязательные overrides для поисковых метаданных и карточек соцсетей. H1 и видимое вступление берутся из основных полей.
- `faq`: до 20 пар `{question, answer}`. Выводятся видимо вместе со структурированной разметкой. FAQ необязателен, наличие не гарантирует расширенный сниппет.
- `relatedSlugs`: до 10 существующих статей того же языка; выводятся как внутренние ссылки.
- `provenance`: `{agent, model?}` сохраняется для учёта. Публичного автора задают существующие настройки сайта.
- Даты публикации/изменения, canonical и маркер версии назначает сервер. Произвольные HTML, JSON-LD, robots и frontmatter не принимаются.

## Markdown и изображения

Поддерживаются H2/H3, списки, таблицы, код, ссылки HTTPS/внутренние пути и LaTeX. H1 берётся из заголовка статьи. Raw HTML, исполняемый MDX и отдельный YAML-блок запрещены. Код внутри fenced code blocks остаётся обычным текстом.

В одной статье допускается до 30 изображений. Изображение сначала загружается **сырыми байтами**, не JSON/base64 и не multipart:

```bash
curl --fail-with-body "$CONTENT_API_BASE/media/" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: image/png' \
  --data-binary @cover.png
```

Ответ: `{ "asset": { "id", "url", "width", "height", "mimeType", "byteSize" } }`. Допустимы PNG/JPEG/WebP/AVIF/GIF до 5 MiB, до 10 000px по стороне и 40 мегапикселей. MIME проверяется по содержимому. Картинка полностью декодируется, учитывается ориентация, размер уменьшается до 2400px по длинной стороне и сохраняется в WebP; GIF становится статичным первым кадром. Повреждённые файлы отклоняются. Повтор одинаковых байтов возвращает тот же asset; отдельный Idempotency-Key не нужен. SVG не принимается.

В теле: `![Описание диаграммы](asset:<asset UUID>)`. Сайт заменяет ссылку постоянным URL. Заголовок картинки Markdown можно использовать как подсказку: `![Описание](asset:<UUID> "Подпись")`. Внешние картинки по URL не скачиваются. Это исключает зависимость от временных ссылок агента и обращение сервера к произвольным адресам.

## Обновления и конфликты

1. `GET /articles/{id}` возвращает текущую версию и документ.
2. `PUT /articles/{id}` принимает `{article, expectedVersion, mode?}`. Это полная замена документа; пропущенные optional-поля сбрасываются.
3. Используйте новый Idempotency-Key для нового изменения. Старый ключ используется только для сетевого повтора прежнего запроса.

`409 version_conflict` означает, что кто-то уже обновил документ. Прочитайте его заново и объедините изменения. Во время активной публикации изменения запрещены (`publication_in_progress`).

**Ломающее изменение (октябрь 2026).** Из контракта удалены `manualRevision`, `manualEditsPending`, `remote` в ответе GET, поля `acknowledgedManualRevisionId` и `expectedRemoteHash` в PUT и коды `manual_edit_conflict` и `remote_edit_conflict`. PUT со старыми полями получает `422 validation_error` (схема строгая): уберите их из запроса. API больше не сверяется с правками из админки и с содержимым GitHub: единственный писатель статей, созданных через API, это сам API, и публикация перезаписывает их файл.

Ограничения до перехода на хранение в БД:

- Правка файла такой статьи в админке вне активной публикации молча перезаписывается следующей публикацией через API; правка остаётся только в истории git. Во время публикации сохранение этой статьи в админке блокируется на уровне БД.
- Публикация из админки (`publish.one`) тоже может откатить коммит API устаревшим содержимым файла с диска контейнера, пока сайт не пересобран.
- Первая публикация не перезаписывает файл, который уже лежит по адресу статьи и которым статья ещё не владела (файл с `apiRevision` одной из её публикаций считается её собственным): она завершается `failed` с `slug_conflict`. Создание статьи с slug существующего файлового поста тоже даёт `409 slug_conflict`. Правило «slug занят только в БД» начнёт действовать после перехода.

## Запись: версии, restore, удаление, снятие, пакет

- **Версии.** Каждое сохранение (создание, PUT, restore) пишет строку истории в той же транзакции с автором: `actorKeyId` (для сессии это ключ `admin-session`) и `actorUserId` (только сессия). Статья, сохранённая между миграцией 0008 и этим релизом, может не иметь строки текущей версии.
- **`POST /articles/{id}/versions/{n}/restore/`** `{expectedVersion}` (скоуп `articles:write`, `Idempotency-Key`): новая версия `version+1` с документом версии `n`; история не переписывается. Порядок: `404`, `409 version_conflict`, `409 publication_in_progress`, `404 not_found` (нет строки `n`, `details: {version, currentVersion}`), `422 version_incompatible` (сохранённый документ не проходит текущий контракт), затем проверка ссылок и изображений. Ответ `200` как у PUT, плюс `restoredFrom` и `warnings`.
- **`GET /articles/{id}/`** отдаёт `ETag: "<version>"`. Это токен только для `If-Match`: `status` и `publication` меняются без смены версии, поэтому как валидатор кэша он не годится, `If-None-Match` не поддерживается.
- **`DELETE /articles/{id}/`** (скоуп `articles:write`) с `If-Match: "<version>"`. Без заголовка `428 precondition_required`; не вида «одна строгая версия в кавычках» (`*`, `W/"3"`, список) `400 invalid_if_match`; версия не совпала `412 precondition_failed` (`details: {version}`). Затем `409 publication_in_progress`; `409 unpublish_first`, если статья опубликована **или её файл уже лежит в git** (первая публикация не дошла до `published`, но коммит прошёл: удаление оставило бы не-черновой файл, который подхватит следующая сборка; сначала `unpublish`); `409 was_published`, если статья когда-либо выходила (история публичного не удаляется). Иначе удаляются публикации статьи и сама статья, история версий уходит каскадом. Ответ `200 {id, deleted: true}`. Идемпотентности нет: повтор даст `404`. Строка `posts_meta` общая для RU и EN и остаётся.
- **`POST /articles/{id}/unpublish/`** `{expectedVersion}` (скоуп `articles:publish`, `Idempotency-Key`) снимает **один язык**: воркер удаляет файл коммитом (только файл, которым статья владеет), затем ждёт, пока страница ответит `404`/`410` **и** настоящий sitemap (`<urlset>` хотя бы с одним `<loc>`) перестанет содержать адрес. Пустое тело, HTML-страница ошибки или sitemap без записей не считаются доказательством. Обе проверки ждут в `publishing` без ошибки до общего срока в 30 минут (`504 deployment_timeout`, `failed`). Итог: `unpublished_at` задан, `publishedVersion`, `publishedContent` и указатель сборки сброшены, `firstPublishedAt` остаётся. Снять оба языка = два вызова. `posts_meta` не трогается (порядок и закрепление нужны при повторной публикации). Публикация-`unpublish` не запускает хуки (IndexNow, соцчерновики). Отказы: `409 not_published` (черновик без файла в git), `409 referenced_by_related` (`details.articleIds`: опубликованные статьи того же языка со ссылкой в `relatedSlugs`: в их закоммиченном Markdown живая ссылка), `409 publication_in_progress`. Уже снятая статья: `200 unchanged: true`. Публикация поля `kind` (`publish`/`unpublish`) видна в ответах и в `GET /publications/{id}/`.
- **`POST /publish/`** `{items: [{id, expectedVersion}]}` (1–2 элемента, скоуп `articles:publish`, `Idempotency-Key`): публикует RU и EN одного slug как одну операцию. Все элементы одного slug (`422 batch_slug_mismatch`, `details.slugs`), версии актуальны (`409 version_conflict`, `details: {id, version}`), иначе нет ни одной строки: всё в одной транзакции. Элемент с уже опубликованной текущей версией получает `unchanged: true` и не создаёт строку. Остальные делят `batch_id`, RU идёт первым. Ответ `202 {batchId, items}`; если очередь пуста, `200` с `batchId: null`.
- `POST /articles/{id}/publish/` отвечает `unchanged`, только если последняя публикация не `unpublish`: после снятия (в том числе неудавшегося) вызов восстанавливает страницу.

## Публикация и повторы

```bash
curl --fail-with-body "$CONTENT_API_BASE/articles/$ARTICLE_ID/publish/" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: article-publication-v1' \
  --data '{"expectedVersion":1}'

curl --fail-with-body "$CONTENT_API_BASE/publications/$PUBLICATION_ID/" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

Опрос — примерно раз в 15 секунд. Перед подтверждением также проверяется публичная доступность всех изображений. Статусы:

- `queued`: документ сохранён, ожидает отправки.
- `publishing`: GitHub принял версию, ожидается сборка/развёртывание.
- `published`: публичный HTML содержит именно этот маркер версии и SEO-метаданные, а адрес присутствует в sitemap.
- `failed`: ошибка, детали в `error.code` и `error.message`.

Задания выполняются последовательно. Блокировка PostgreSQL предотвращает двойное исполнение на нескольких репликах. Падение процесса освобождает блокировку; документ и задание сохраняются. При потере ответа GitHub повтор распознаёт уже записанное содержимое.

Временные сетевые ошибки повторяются с задержкой до пяти попыток; ожидание появления страницы ограничено 30 минутами. После исправления причины вызовите `/publish` с новым Idempotency-Key. После ошибки развёртывания создаётся новый маркер и новый коммит для повторной сборки. Уже опубликованная неизменённая версия возвращает `200` и `unchanged: true`.

Успех API означает доступность страницы, а не индексацию поисковиком. Индексацию и органический трафик проверяйте отдельно в Search Console/аналитике.

## Настройка сервера

1. Применить миграции обычным способом. Контейнер делает это через `scripts/migrate-prod.mjs` при старте. Для отдельного запуска: `node scripts/migrate-prod.mjs` с DATABASE_URL нужной среды.
2. Задать S3-параметры из `.env.example`: `CONTENT_S3_ENDPOINT`, `CONTENT_S3_REGION`, `CONTENT_S3_BUCKET`, `CONTENT_S3_ACCESS_KEY_ID`, `CONTENT_S3_SECRET_ACCESS_KEY`, `CONTENT_S3_PUBLIC_URL`. Для AWS S3 endpoint можно не задавать; region должен быть реальным регионом. Для path-style провайдера — `CONTENT_S3_FORCE_PATH_STYLE=true`.
3. Обеспечить публичное чтение объектов `articles/*` через указанный HTTPS URL. Ключу сервера достаточно записи в этот префикс. Удаление объектов отдельно от статей не предоставляется — это сохраняет старые версии и предотвращает битые картинки.
4. Задать `CONTENT_WORKER_SECRET` (случайный секрет минимум 32 символа), `SITE_URL`, существующие `GITHUB_PAT`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_DEFAULT_BRANCH`.
5. Проверить существующий GitHub Actions workflow и `DOKPLOY_WEBHOOK_URL`. Токен GitHub должен иметь запись содержимого репозитория и запускать push workflows. Сборка без работающего deploy webhook не завершит публикацию.
6. В Docker worker запускается автоматически при наличии CONTENT_WORKER_SECRET. Локально запустить `pnpm dev` и `pnpm content:worker`. Роут `POST /api/v1/_worker/` предназначен только для worker-secret, не для ключей агентов.
7. Супервизия worker. `CONTENT_WORKER_SECRET` не задан: worker намеренно выключен, `GET /api/version` отвечает 200 с `worker.status: "disabled"`. Задан, но короче 32 байт (для ASCII это 32 символа): `docker-entrypoint.sh` завершается с кодом 1, контейнер не стартует. Задан корректно: каждый запрос worker к `/_worker/` отмечает тик в памяти сервера; если тиков нет дольше 180 секунд, `GET /api/version` отвечает 503 с `worker.status: "stale"`, и Docker `HEALTHCHECK` помечает контейнер unhealthy (ещё три проверки по 30 секунд). Выкладку мёртвый worker не блокирует: первые 180 секунд после старта ответ 200. Перезапустит ли оркестратор unhealthy-контейнер, зависит от режима Dokploy (Swarm-сервис перезапускает, обычный Docker только помечает). Тело `/api/version` при 503 остаётся валидным JSON с `commit` и `builtAt`: скрипты, которые ждут выкладку, должны читать тело, а не `response.ok`. Локально `pnpm dev` с заданным секретом и без `pnpm content:worker` тоже начнёт отдавать 503 на `/api/version` через три минуты.

Создание/отзыв ключей (операторская CLI, без публичного административного API):

```bash
pnpm content:key create research-writer articles:read articles:write articles:publish media:write
pnpm content:key revoke <key-uuid>
```

CLI использует DATABASE_URL текущей среды; полный токен выводится один раз, в БД хранится SHA-256. Ключи действуют на один сайт, а не на отдельного автора. Для агента, создающего только черновики, не выдавайте `articles:publish`. Отзыв запрещает и ещё не начатые публикации. Уже отправленный в GitHub коммит отзывом не откатывается.

Проверка настройки: загрузить небольшое изображение, открыть возвращённый публичный URL, создать тестовый черновик, запустить публикацию, дождаться published, проверить HTML/обложку/sitemap/RSS/поиск, перезапустить приложение и убедиться, что статья и изображение сохранились.

Состояние очереди хранится в `content_publications`, документы — `content_articles`, assets — `content_assets`, идемпотентные ответы — `content_api_requests`. Ключи и исходные тексты не записываются в сообщения об ошибках HTTP. Резервное копирование должно включать PostgreSQL и S3; опубликованный Markdown дополнительно хранится в GitHub.

## Ошибки

Единый формат: `{error: {code, message, requestId, details?}}`. `details` ошибок схемы содержит путь поля и сообщение. `x-request-id` позволяет связать ответ с серверным событием.

| HTTP | Значение |
| --- | --- |
| 400 | Невалидный JSON, отсутствующий Idempotency-Key или неверный If-Match (`invalid_if_match`) |
| 401/403 | Неверный ключ или нет сессии / недостаточные права, роль или Origin (`origin_mismatch`) |
| 404 | Статья, публикация или маршрут не найдены |
| 409 | Конфликт ID, версии, slug, активной публикации или повторного запроса |
| 412/428 | `If-Match` не совпал с версией (`precondition_failed`) / не передан (`precondition_required`) |
| 413/415 | Слишком большой запрос / неправильный Content-Type |
| 422 | Документ, Markdown или изображение не проходит проверку |
| 429 | Более 60 запросов в минуту на ключ; Retry-After: 60 |
| 503 | Хранилище, БД или внешняя служба недоступны/не настроены |

## Проверки разработчика

```bash
pnpm exec tsx scripts/content-contract.ts
pnpm exec vitest run tests/unit/content-api
pnpm exec vitest run --project db tests/integration/content-api.test.ts tests/integration/content-api-session.test.ts tests/integration/content-media.test.ts
pnpm content:smoke
pnpm typecheck
pnpm build
```

JSON Schema/OpenAPI генерируются из тех же Zod-схем, которые валидируют запросы. При изменении контракта обновлять оба артефакта. Несовместимые изменения требуют нового префикса версии API.
