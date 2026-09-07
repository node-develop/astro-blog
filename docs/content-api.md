# Content API v1

API принимает **готовые статьи**. Исследование источника, написание текста, создание изображений и переводы выполняет внешний агент. Один запрос содержит одну языковую версию.

- Base URL: `https://artka.dev/api/v1`
- [OpenAPI 3.1](api/openapi.json), [JSON Schema статьи](api/article.schema.json), [пример запроса](api/article.example.json).
- Актуальная спецификация доступна по `GET /api/v1/openapi.json`.
- Формат JSON, UTF-8. Неизвестные поля отклоняются. Размер JSON-запроса — до 1 MiB, тело статьи — до 200 000 символов.

## Быстрый старт для агента

Сохраните API-ключ в секретах среды. `CONTENT_API_TOKEN` ниже — переменная клиента, сайт её не читает.

```bash
export CONTENT_API_BASE=https://artka.dev/api/v1
# CONTENT_API_TOKEN передаётся через secret manager.

# Проверить документ без сохранения.
curl --fail-with-body "$CONTENT_API_BASE/articles/validate" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @docs/api/article.example.json

# Создать черновик. Сохраняйте этот ключ для повторов ТОГО ЖЕ запроса.
curl --fail-with-body "$CONTENT_API_BASE/articles" \
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
    "statusUrl": "/api/v1/publications/<publication UUID>"
  },
  "warnings": []
}
```

Пример ответа сокращён; полный контракт полей описан в OpenAPI. У черновика `publication: null`. Поле `state` статьи относится к текущей сохранённой версии; отдельный процесс находится в `publication.state`. Во время публикации обновления старая версия страницы продолжает работать.

## Поля статьи

Обязательные: `externalId`, `lang` (`ru`/`en`), `slug`, `title`, `description`, `summary`, `body`, `tags`, `sources`, `provenance.agent`.

- `slug`: 1–100 символов, строчные латинские буквы/цифры, слова разделены одиночными дефисами. Адрес после создания не меняется.
- `externalId`: стабильный ID материала, 1–200 символов. Совпадение возвращает `409` с ID существующей статьи. Несколько статей по одному источнику допустимы при разных externalId.
- Перевод имеет те же `externalId` и `slug`, другой `lang`. Сайт связывает существующие версии через hreflang. Автоперевода нет.
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
curl --fail-with-body "$CONTENT_API_BASE/media" \
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

Ручные изменения в админке возвращаются в `manualRevision`; `manualEditsPending: true` требует объединения правок. После объединения передайте в PUT `acknowledgedManualRevisionId`. Без подтверждения новая ручная версия не перезаписывается. Пока публикация активна, сохранение/восстановление этой статьи в админке блокируется на уровне БД.

Изменения Markdown в GitHub также защищены: публикация сравнивает точное содержимое и обновляет ветку без force. Если remote изменился, получите `remote_edit_conflict`. GET возвращает `remote.content` и `remote.hash` (при доступном GitHub). После объединения передайте PUT `expectedRemoteHash`, равный прочитанному хешу. Не подставляйте хеш без проверки содержимого.

API не импортирует и не перезаписывает существующие статьи по занятому slug. Для исходной миграции старых статей потребуется отдельный сценарий.

## Публикация и повторы

```bash
curl --fail-with-body "$CONTENT_API_BASE/articles/$ARTICLE_ID/publish" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: article-publication-v1' \
  --data '{"expectedVersion":1}'

curl --fail-with-body "$CONTENT_API_BASE/publications/$PUBLICATION_ID" \
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
6. В Docker worker запускается автоматически при наличии CONTENT_WORKER_SECRET. Локально запустить `pnpm dev` и `pnpm content:worker`. Роут `POST /api/v1/_worker` предназначен только для worker-secret, не для ключей агентов.

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
| 400 | Невалидный JSON или отсутствующий Idempotency-Key |
| 401/403 | Неверный ключ / недостаточные права |
| 404 | Статья, публикация или маршрут не найдены |
| 409 | Конфликт ID, версии, ручных правок, slug или повторного запроса |
| 413/415 | Слишком большой запрос / неправильный Content-Type |
| 422 | Документ, Markdown или изображение не проходит проверку |
| 429 | Более 60 запросов в минуту на ключ; Retry-After: 60 |
| 503 | Хранилище, БД или внешняя служба недоступны/не настроены |

## Проверки разработчика

```bash
pnpm exec tsx scripts/content-contract.ts
pnpm exec vitest run tests/unit/content-api tests/integration/content-api.test.ts tests/integration/content-media.test.ts
pnpm content:smoke
pnpm typecheck
pnpm build
```

JSON Schema/OpenAPI генерируются из тех же Zod-схем, которые валидируют запросы. При изменении контракта обновлять оба артефакта. Несовместимые изменения требуют нового префикса версии API.
