# Технический SEO-аудит artka.dev: обход и индексируемость

Дата проверки: 10 октября 2026. Прод на коммите `b9526c5` (ответ `/api/version/`: `"commit":"b9526c5…"`, `builtAt 2026-10-05`).
Метод: собственный обход от `/` и `/en/` (UA Googlebot Smartphone, настоящий заголовок `Accept` Googlebot, до 500 адресов), прямые запросы curl, чтение кода в `/home/claude/astro-blog` (только чтение), история `origin/main` (286 коммитов).
Сырые данные: `technical-crawl.json` рядом с этим файлом (все страницы обхода, входящие ссылки, матрица согласования содержимого, проверка служебных и старых адресов).

Ограничения, честно:
- Сетевые скрипты claude-seo (`fetch_page.py`, `sitemap_discovery.py`, `agentic_check.py`, `render_page.py`) отказались работать через локальный прокси контейнера (`url_safety: Refusing configured HTTP proxy '127.0.0.1'`). Отключать прокси нельзя, поэтому обход и проверки сделаны своим кодом на requests + BeautifulSoup с теми же правилами.
- PageSpeed Insights вернул `Quota exceeded`. Core Web Vitals и Lighthouse Agentic Browsing **не измерены**.
- Запросы шли через прокси, поэтому настоящий сертификат и заголовки TLS-уровня проверить нельзя. Отсутствие HSTS видно в ответах через прокси.
- Подмена User-Agent показывает поведение сервера на строку, но не доказывает, как сервер обходится с настоящим Googlebot по IP.

---

## Оценки

**Technical SEO: 82/100**
**AI Search Readiness: 74/100**

| Категория | Статус | Балл | На чём основано |
|---|---|---:|---|
| Обход (robots, карты сайта, ссылки) | pass | 92 | robots.txt валиден, карта из 82 адресов, 0 битых внутренних ссылок на 113 адресах, глубина не больше 3 кликов |
| Индексируемость | warn | 70 | canonical и hreflang чистые на 82/82, но 44 markdown-двойника застряли за Disallow, много тонких адресов в карте |
| Безопасность | warn | 60 | HTTPS и www/http в 1 шаг; HSTS нет нигде; заголовки безопасности есть только у SSR-страниц |
| Структура адресов | pass | 88 | слэш в конце везде, 301; есть дубли `index.html` и `//`, отдающие 200 (canonical верный) |
| Мобильная версия | pass | 90 | viewport есть, один и тот же HTML для всех UA (паритет полный) |
| Core Web Vitals | не измерено | - | квота PSI исчерпана |
| Структурированные данные | pass | 85 | JSON-LD граф на всех типах страниц (детали у специалиста по схеме) |
| Рендеринг | pass | 95 | весь основной текст в исходном HTML, SSG/SSR, JS не нужен |
| IndexNow | не проверено снаружи | - | маршрут `[indexnowKey].txt` есть, ключ снаружи неизвестен |

---

## Главный вывод для вопроса «почему Google не индексирует»

Я не нашёл технического дефекта, который сам по себе объясняет «Просканирована, но пока не проиндексирована». Проверено именно то, что могло бы это объяснить:

1. **Согласование содержимого не задевает Googlebot.** Markdown вместо HTML отдают только `/` и `/en/` и только когда клиент явно просит `text/markdown` с приоритетом выше HTML. С настоящим `Accept` Googlebot, с `*/*` и вообще без `Accept` все 11 типов страниц отдают HTML. Таблица ниже.
2. **Нет клоакинга.** Googlebot Smartphone, Googlebot Desktop, Bingbot, YandexBot, Chrome, curl, Google-InspectionTool получают байт-в-байт одинаковый HTML (md5 совпадает на статье и на `/blog/`).
3. **Нет случайных noindex.** На 82 адресах карты: `meta robots = max-image-preview:large`, `X-Robots-Tag` нет, canonical сам на себя, hreflang ru/en/x-default полный и взаимный.
4. **Ответы стабильны.** 5 запросов подряд к 8 типам страниц: все 200, HTTP/2, brotli, TTFB 0,36-0,67 с. Статические страницы совпадают по хешу; главная отличается только случайным id SVG-печати (`seal-70luvl` против `seal-zbr90g`), это безвредно.
5. **Нет ссылок на 404.** Обход нашёл 113 адресов, все 200.

Значит, отказ Google держится на качестве и объёме (тонкие уроки, тонкие архивы, машинный перевод, молодой сайт без внешних сигналов). Технический слой даёт «шум»: около 100 лишних адресов, которые Google знает помимо карты, и 44 markdown-двойника, которые нельзя ни переобойти, ни убрать. Это не причина отказа, но это мешает проверке исправления и раздувает отчёт.

### Откуда Google знает ~188 адресов при 82 в карте

Восстановлено по обходу, коду и истории коммитов. Точный список даст только выгрузка из Search Console, но сумма сходится:

| Семейство | Кол-во | Статус сейчас | Откуда Google узнал |
|---|---:|---|---|
| Адреса карты сайта | 82 | 200, индексируемые | sitemap-index.xml |
| Markdown-двойники постов и уроков (`/blog/<slug>.md`, `/courses/claude-code-guide/<lesson>.md`, EN-версии) | 44 | 200 `text/markdown`, закрыты `Disallow: /*.md$` с 19.09 | `<link rel="alternate" type="text/markdown">` в `<head>` каждой статьи и урока; открыты для обхода с мая по 19 сентября |
| Архивы тегов с одной статьёй (12 тегов x 2 языка) | 24 | 200, `noindex,follow` | чипы тегов на `/blog/`, `/tags/` и в статьях |
| Старые 404 (склеенные адреса уроков, `/05-hooks`, `/terms`, удалённый тестовый пост `content-api-deployment-check-20260907`, `/blog/partials/N/`, бывший тег `/tags/guide/`) | ~30 | склеенные теперь 301 в один шаг, остальные честный 404 | старые относительные ссылки в уроках, старые версии сайта |
| Служебные: `/search/`, `/en/search/`, `/login/`, `rss.xml` x3, `feed.json` x2, `llms.txt`, `llms-full.txt`, `/api/v1/openapi.json`, `robots.txt`, `humans.txt`, `security.txt` | ~14 | 200; поиск и вход с noindex; `llms-full.txt` с `X-Robots-Tag: noindex`; openapi закрыт `Disallow: /api/` | ссылки в статьях, на страницах проекта, `<link rel=alternate>` фидов |
| Варианты с переадресацией и параметрами (`http://`, `www.`, без слэша, `?page=2`, `?utm…`) | несколько | 301 / 200 с canonical на чистый адрес | внешние ссылки, старые карты |

Итого около 190. Большая часть разницы это двойники и закрытые теги.

---

## Что работает

- robots.txt: 200, `text/plain`, группа `*` разрешает всё, кроме `/admin/`, `/api/` и `/*.md$`; карта указана; HTML-страницы правилом `/*.md$` не задеты (адреса заканчиваются на `/`, а `03-claude-md/` не матчится на `.md$`).
- Карта сайта: индекс из двух файлов, 41 + 41 адрес, все 200, все канонические, без noindex и без переадресаций. `lastmod` реальные (по `updatedDate`/`pubDate`, `src/lib/seo/sitemap.ts:107-137`), а не дата сборки: 2026-09-07, 09-08, 09-19, 09-25, 10-01, 10-02, 10-03.
- hreflang: на всех 82 страницах есть self-ссылка, x-default (на RU), обратные ссылки сходятся (проверено попарно скриптом). На noindex-страницах и 404 hreflang нет (`src/layouts/BaseLayout.astro:121`).
- Склеенные адреса уроков чинятся одним правилом в middleware (`src/middleware.ts`, `resolveConcatenatedLessonPath` в `src/lib/seo/redirects.ts`): `/courses/claude-code-guide/03-claude-md/04-skills/` отдаёт 301 на `/courses/claude-code-guide/04-skills/`. Удалённые посты и `/igaming/` 301 на `/blog/`.
- `www.artka.dev`, `http://artka.dev`, `http://www.artka.dev` уходят на `https://artka.dev/` за один шаг 301.
- 404 честный (`/blog/nonexistent-xyz/` = 404, noindex). Регистр не склеивается в 200 (`/BLOG/...` = 404).
- Условные запросы работают: `If-None-Match` и `If-Modified-Since` дают 304 на статических страницах. Ассеты `/_astro/*` с `max-age=31536000, immutable`.
- Весь основной текст в исходном HTML, `<h1>` ровно один на каждой странице, `lang` совпадает с локалью.
- Внутренние ссылки: каждая страница карты получает минимум 3 входящие ссылки, все в пределах 3 кликов от `/` или `/en/`.

---

## Находки

### High

#### H1. 44 markdown-двойника застряли: Google их уже обошёл, а теперь не может ни переобойти, ни убрать

**Доказательства.**
- Двойники отдаются со статусом 200 и только `Content-Type`, без `X-Robots-Tag` и без `Link: rel=canonical`:
  ```
  $ curl -sSI https://artka.dev/blog/claude-md-12-rules.md
  HTTP/2 200
  cache-control: public, max-age=0
  content-type: text/markdown; charset=utf-8
  ```
  То же для `/courses/claude-code-guide/03-claude-md.md` и `/en/blog/claude-md-12-rules.md`.
- Ссылка на двойник стоит в `<head>` каждой статьи и урока: `src/layouts/PostLayout.astro:194`, `src/layouts/LessonLayout.astro:166`. Обход насчитал 44 таких `<link rel="alternate" type="text/markdown">`.
- До 19 сентября двойники были открыты для Googlebot. Закрыты коммитом `23ae809` (2026-09-19) строкой `public/robots.txt:114` `Disallow: /*.md$`. В сообщении коммита прямо: «about 40 duplicate URLs… The files are static, so headers cannot be attached».
- Отдаёт их `markdownFileResponse` (`src/lib/agents/documents.ts:136-137`), маршруты пререндерятся (`src/pages/blog/[slug].md.ts:20`, `src/pages/courses/[course]/[lesson].md.ts`), поэтому middleware их не трогает.
- В Search Console «Заблокировано в robots.txt» всего 2 адреса. Значит, остальные двойники Google ещё держит в старом состоянии (скорее всего в «Просканирована, но не проиндексирована», куда он положил их, когда они были открыты). Это гипотеза, подтверждается выгрузкой отчёта.

**Почему это важно.** Disallow не удаляет адрес из индекса, он только запрещает обход. Google уже знает эти адреса и не может увидеть, что это копии. Они остаются в отчёте, раздувают «просканирована, но не проиндексирована» и мешают проверке исправления: Google переобходит выборку, видит те же адреса в том же состоянии и снова пишет «не пройдена».

**Исправление.** Отдавать двойники с заголовками и открыть их для обхода Google, чтобы он сам их выкинул:
1. `src/pages/blog/[slug].md.ts`, `src/pages/en/blog/[slug].md.ts`, `src/pages/courses/[course]/[lesson].md.ts`, `src/pages/en/courses/[course]/[lesson].md.ts`: либо `prerender = false` (тогда можно ставить заголовки), либо оставить пререндер и повесить заголовки в Traefik (middleware `headers` с роутером по `PathRegexp(\.md$)`).
2. В ответе: `X-Robots-Tag: noindex` и `Link: <https://artka.dev/blog/<slug>/>; rel="canonical"` (canonical-заголовок Google поддерживает для не-HTML ответов). Расширить `markdownFileResponse(body)` до `markdownFileResponse(body, canonical)`.
3. Только после выката заголовков убрать `Disallow: /*.md$` из группы `*` в `public/robots.txt`. Иначе Google не увидит ни noindex, ни canonical. ИИ-группы и так имеют доступ.
4. Через 2-4 недели проверить в Search Console, что двойники переехали в «Исключено тегом noindex» или «Вариант страницы с canonical», и только потом перезапускать проверку исправления по «просканирована, но не проиндексирована».

#### H2. В карте сайта половина адресов тонкие: это главный индексационный риск

**Доказательства** (слова основного текста в исходном HTML, без скриптов и стилей; подробности в `technical-crawl.json`, поле `main_words`):
- 26 уроков из 28: прозы урока 270-420 слов (исходники: `src/content/courses/claude-code-guide/03-claude-md.md` 367 слов, `07-plugins.md` 315, EN `07-plugins.md` 269). Только урок 06 около 1700-1800 слов.
- 14 архивов тегов в карте: 94-148 слов на странице, почти всё это карточки статей (`/tags/ai/` 94, `/tags/claude-code/` 99, `/en/tags/ai/` 96).
- `/tags/` и `/en/tags/`: 56 слов. `/projects/`: 82, `/en/projects/`: 79. `/projects/claude-code-guide/`: 185 слов, из них прозы 107.
- Итого 44 из 82 адресов карты меньше 450 слов основного текста, включая хром.
- Посты длинные (600-8400 слов), но их всего 8 на язык.

**Почему это важно.** Google оценивает сайт целиком. Когда больше половины того, что сайт сам просит проиндексировать, это короткие уроки и списки карточек, падает оценка всех адресов, включая хорошие статьи. Индекс упал с 8 до 3 при том, что технически всё чисто, это совпадает с такой картиной.

**Исправление** (технические рычаги, содержательная часть у специалиста по контенту):
- Убрать из карты `/tags/`, `/en/tags/`, архивы тегов и `/projects/`, пока у них нет своего уникального текста хотя бы на 150-250 слов. Архивам дать `noindex,follow` по тому же правилу, что и одиночным тегам: `src/lib/seo/indexability.ts` (`MIN_INDEXABLE_TAG_POSTS = 2` поднять, либо индексировать только архивы с введением). Генерация карты: `src/lib/seo/sitemap.ts`.
- Уроки: либо наращивать до полноценного объёма, либо объединить по 2-3 в один адрес с 301 со старых (механизм редиректов уже есть в `src/lib/seo/redirects.ts`).

### Medium

#### M1. Заголовки безопасности только у SSR-страниц, HSTS нет нигде

**Доказательства.**
- `/` (SSR): `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy`, `permissions-policy`, `content-security-policy-report-only`.
- `/blog/claude-md-12-rules/`, `/tags/seo/` (статические): только `accept-ranges, cache-control, content-encoding, content-type, etag, last-modified, vary`. Ни одного заголовка безопасности.
- `Strict-Transport-Security` нет ни на одном ответе (проверено на `/`, статьях, редиректах).
- Причина: заголовки ставит middleware `securityHeaders` (`src/middleware.ts:93-101`), а пререндеренные файлы node-адаптер отдаёт без middleware.

**Влияние на поиск** небольшое: HTTPS-сигнал лёгкий, а домен `.dev` целиком в списке HSTS preload браузеров. Но это расхождение «настроили, а на 90% страниц не работает».

**Исправление.** Перенести заголовки на уровень Traefik в Dokploy (middleware `headers` на роутер сервиса): `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`. В `src/middleware.ts` оставить только CSP, если нужен разный по страницам. Записать в `docs/runbooks/` рядом с runbook по www.

#### M2. SSR-страницы отдают `Content-Type: text/html` без charset: у не-браузерных клиентов кириллица превращается в мусор

**Доказательства.**
- `/`, `/en/`, `/blog/`, `/en/blog/`, `/search/`, 404: `content-type: text/html`. Статические страницы: `text/html; charset=utf-8`.
- Обходчик на Python requests по стандарту HTTP взял ISO-8859-1 и получил заголовки вида `artka.dev â Artyom Kashuta | AI-Ð°Ð³ÐµÐ½ÑÑ Ð¸ backend` (в `technical-crawl.json`, поле `title` у `/`, `/blog/`, `/en/`).
- Браузеры и Google видят правильно: `<meta charset="utf-8">` стоит на 62-м байте.

**Почему важно.** Для Google почти безвредно, но часть ИИ-агентов и парсеров берёт кодировку из заголовка. Главная и список статей, то есть точки входа для агентов, читаются ими с битой кириллицей.

**Исправление.** В `src/lib/http/public-cache.ts` (`applyPublicHtmlCache`) или в middleware для HTML-ответов ставить `Content-Type: text/html; charset=utf-8`. Проверка: `curl -sI https://artka.dev/ | grep -i content-type`.

#### M3. Доступность сайта привязана к воркеру публикаций

**Доказательства.** Docker `HEALTHCHECK` бьёт в `/api/version` (`Dockerfile:76-77`). Если задан `CONTENT_WORKER_SECRET` и воркер молчит дольше 180 с, роут отвечает 503 (`src/pages/api/version.ts`, `WORKER_MAX_SILENCE_MS` в `src/lib/content-api/heartbeat.ts`). Сейчас воркер включён и жив: `"worker":{"status":"ok","lastTickAt":"2026-10-10T06:38:12.508Z"}`.

**Почему важно.** Нездоровый контейнер Traefik перестаёт маршрутизировать (или Swarm его перезапускает, и миграции гоняются заново). Для Googlebot это 502/404 на всём сайте, а на маленьком сайте серия 5xx быстро снижает частоту обхода. Сбой воркера публикаций не должен ронять чтение блога. Подтвердить или снять: Search Console, «Статистика сканирования», «Статус хоста» и ответы 5xx за 90 дней; логи Dokploy по рестартам.

**Исправление.** Отдельный liveness для сайта (200, пока процесс отвечает) и отдельный сигнал о воркере (поле в JSON плюс алерт), без 503 на healthcheck.

#### M4. EN-версии это машинный перевод без пометки

**Доказательства.** EN-двойники генерирует `pnpm translate` моделью из `src/lib/translate/claude.ts` (по `CLAUDE.md`), вручную помечены `manuallyEdited: true` только 4 файла. На `/en/blog/claude-md-12-rules/` нет видимой пометки о переводе; в JSON-LD `inLanguage: "en-US"` (`src/lib/seo/nodes-global.ts:85`), а в hreflang и `<html lang>` просто `en`.

**Почему важно.** Политика Google о спаме называет автоматический перевод без ручной проверки формой scaled content abuse. Качество перевода я не оценивал, это задача контента. Технически пометка и согласованные коды языка снимают двусмысленность.

**Исправление.** Видимая строка «Translated from Russian, reviewed by the author» на EN-страницах после ручной вычитки; `inLanguage` привести к `en` (или hreflang к `en-US`, но одинаково везде).

### Low

#### L1. Дубли адресов, отдающие 200
- `/blog/claude-md-12-rules/index.html` 200, `/blog//claude-md-12-rules/` 200, `/blog/claude-md-12-rules//` 200, `/blog/?page=2` 200. Canonical везде на чистый адрес, так что вред минимальный.
- Исправление: в Traefik `redirectregex` с `(.*)/index\.html$` на `$1/` и схлопывание `//` (статические файлы middleware Astro не видит).

#### L2. Цепочки из двух переадресаций
- `http://artka.dev/blog/claude-md-12-rules` : 301 на `https://…/claude-md-12-rules`, потом 301 на `…/claude-md-12-rules/`.
- `/courses/claude-code-guide/03-claude-md/04-skills` (без слэша): 301 на версию со слэшем, потом 301 на `/courses/claude-code-guide/04-skills/`.
- Исправление: в `resolveConcatenatedLessonPath` уже канонизируется путь, достаточно запускать правило и для адресов без слэша до редиректа trailing slash; http-цепочку чинить в Traefik (одно правило на схему и слэш).

#### L3. Карта сайта: мелочи
- 24 из 82 адресов без `<lastmod>`: `/`, `/blog/`, `/about/`, `/uses/`, `/now/`, `/tags/`, архивы тегов, `/contact/`, `/privacy/` и их EN-версии.
- `<changefreq>` и `<priority>` есть, Google их игнорирует.
- Картинка в image-sitemap только у одного поста (`custom-domain-email-mailu-dokploy`), и она на чужом домене `media.tgapps.cloud` (200, robots.txt там без запретов). Остальные посты используют сгенерированные OG-PNG `/og/<slug>-ru.png`, которых в карте нет.
- `/sitemap.xml` отдаёт 404 (есть только `/sitemap-index.xml`). Если когда-то отправляли `/sitemap.xml`, в Search Console будет ошибка. Сделать 301 на индекс.

#### L4. Раздел `/courses/` по-прежнему 404
`/courses/` и `/en/courses/` = 404, а в хлебных крошках лендинга курса есть пункт «Курсы» без адреса (отмечено ещё 3 октября). Внутренних ссылок на `/courses/` обход не нашёл, так что это не битая ссылка, а пробел в структуре. Либо страница раздела, либо убрать средний пункт крошки.

#### L5. Главная отдаёт 406 на необычный `Accept`
`/` и `/en/` с `Accept: text/plain` или `Accept: application/xml` отвечают `406 Not Acceptable` (`src/lib/http/content-negotiation.ts:140-153`, вызов в `src/pages/index.astro:37-38`). Googlebot не задет (в его `Accept` есть `text/html` и `*/*`), но некоторые сервисы предпросмотра и валидаторы шлют узкий `Accept`. Безопаснее отдавать HTML по умолчанию вместо 406.

#### L6. Тяжёлая шапка HTML
На статье `<main>` начинается на 86 КБ: 60 КБ встроенного CSS и 23 КБ встроенных скриптов (`/blog/claude-md-12-rules/`, всего 177 КБ). До лимита Googlebot в 2 МБ далеко, но соотношение текста к коду низкое. Порог встраивания CSS: `astro.config.ts`, `assetsInlineLimit` (24 КБ на файл, встраивается несколько файлов).

#### L7. Прочее
- `/api/version` отдаёт 301 на `/api/version/`. Docker healthcheck (`Dockerfile:77`) использует `fetch`, который идёт по редиректу, так что работает, просто лишний шаг. Поставить в healthcheck адрес со слэшем.
- `/courses/claude-code-guide/certificate.png` отдаёт 401. Если на него есть ссылки в HTML или он попал в Search Console, это 4xx в отчёте.
- Заголовок `Vary` на главной приходит дважды (`Accept-Encoding` и `Accept, Accept-Encoding`). Безвредно.

---

## AI Search Readiness: 74/100

Lighthouse Agentic Browsing: **не измерено** (квота PSI). Agent-UX эвристика: **не измерена** (скрипт заблокирован прокси).

**Доступ по назначению (robots.txt):**
- Обучение: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, meta-externalagent, cohere-ai разрешены (кроме `/admin/`, `/api/`).
- Поиск: OAI-SearchBot, Claude-SearchBot, PerplexityBot, DuckAssistBot, Amazonbot разрешены. Googlebot и Bingbot через группу `*`.
- По запросу пользователя: ChatGPT-User, Claude-User, Perplexity-User, Meta-ExternalFetcher, MistralAI-User разрешены.

**Что хорошо:** `llms.txt` (18,8 КБ) с правилами цитирования и картой контента; `llms-full.txt` (302 КБ) с `X-Robots-Tag: noindex`; markdown-двойники для всех постов и уроков с `<link rel="alternate" type="text/markdown">`; согласование `Accept: text/markdown` на главной с `Vary: Accept`; `security.txt`, `humans.txt`; весь текст без JS.

**Находки:**
- (P1) `llms.txt` утверждает неправду. Пункт «Home, blog index and 404 negotiate `Accept: text/markdown` directly» (`src/lib/agents/llms.ts:119`): `/blog/` на `Accept: text/markdown` отдаёт HTML (`src/pages/blog/index.astro` согласования не делает). Тематика в описании включает «distributed systems, gRPC, Kafka, FastAPI» (`src/lib/agents/llms.ts:92`, `:106`), а статей на эти темы на сайте нет (посты про Kafka и микросервисы удалены и 301 на `/blog/`). Агент, поверивший описанию, придёт за тем, чего нет. Исправить текст или добавить согласование в `src/pages/blog/index.astro` и `src/pages/en/blog/index.astro`.
- (P1) Кодировка в SSR-ответах, см. M2: главная и список статей у агентов без разбора `<meta charset>` читаются как мусор.
- (P1) Нет `Content-Signal` ни в одной группе robots.txt (черновой стандарт, проверено 10.10.2026). Это возможность, не ошибка. Политику `ai-train` решает владелец.
- (P2) `/api/v1/openapi.json` закрыт `Disallow: /api/` во всех группах, включая ИИ-агентов, хотя на него ссылаются `/projects/astro-blog/` и `/en/projects/astro-blog/`. Если API должен находиться агентами, нужен точечный `Allow: /api/v1/openapi.json`.
- (P3) Нет `/.well-known/ai-catalog.json`, `api-catalog`, `agent-card.json` (404). Это возможности, не дефекты, имеют смысл только вместе с открытым API.

---

## Матрица согласования содержимого (Googlebot UA)

| Страница | Accept Googlebot | `*/*` | без Accept | `text/markdown` | `text/plain` |
|---|---|---|---|---|---|
| `/` | 200 html | 200 html | 200 html | 200 markdown | 406 |
| `/en/` | 200 html | 200 html | 200 html | 200 markdown | 406 |
| `/blog/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/blog/claude-md-12-rules/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/en/blog/claude-md-12-rules/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/courses/claude-code-guide/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/courses/claude-code-guide/03-claude-md/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/projects/astro-blog/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/about/` | 200 html | 200 html | 200 html | 200 html | 200 html |
| `/tags/`, `/tags/seo/` | 200 html | 200 html | 200 html | 200 html | 200 html |

Вывод: Googlebot нигде не получает markdown. Источник логики: `src/lib/http/content-negotiation.ts:99-111` (пустой или нераспознанный `Accept` даёт HTML; при равном q побеждает HTML по порядку в `REPRESENTATIONS`).

---

## SEO-значимые изменения 19.09-05.10 по истории коммитов

- `23ae809` (19.09) Disallow для `*.md` в группе `*`: см. H1.
- `6bb49fd` (19.09) восстановление склеенных адресов уроков, правило в middleware: работает.
- `42ea6b9` (19.09) все посты достижимы без JS: работает (на `/blog/` ссылки на все 8 постов).
- `fd5f700` (19.09) hreflang ru/en, нет на закрытых страницах и 404: работает.
- `7ac40b9`, `63fe366` и др. (20.09) полный редизайн «poster»: техническую индексируемость не сломал (canonical, hreflang, h1, текст в HTML на месте), но добавил встроенного CSS (L6).
- `88fb8a5` (27.09) GA4; `1671765` (29.09) отложенная загрузка аналитики.
- `6b0185d` (03.10) `max-image-preview:large` на индексируемых страницах: безвредно, это разрешающая директива.
- `1a38ef9` (03.10) обложка поста в image sitemap: работает только для одного поста (L3).
- `9d5b142` (03.10) healthcheck падает без воркера: см. M3.
- Последний деплой: `last-modified: Mon, 05 Oct 2026 08:45` на статических файлах.

Ни один из этих коммитов не добавляет noindex на индексируемые страницы, не меняет canonical и не переключает тип содержимого по User-Agent. Поиск по коду (`noindex`, `x-robots-tag`, `text/markdown`, `Vary`, `Accept`, `user-agent`, `googlebot`) подтверждает: noindex ставят только `login`, `search`, 404, архивы тегов с одной статьёй, `AdminLayout`; `X-Robots-Tag` только у `llms-full.txt`, `blog/partials` и Content API; ветвления по User-Agent в коде нет.

---

## Порядок работ

1. H1: заголовки `noindex` и `Link: rel=canonical` на `.md`, затем снять `Disallow: /*.md$` для `*`.
2. H2: вычистить тонкие адреса из карты (теги, `/tags/`, `/projects/`), решить судьбу коротких уроков.
3. M3: развязать healthcheck и воркер; посмотреть «Статистику сканирования» на 5xx.
4. M1 и M2: заголовки безопасности и charset в Traefik/middleware.
5. Через 2-4 недели после выката 1-2 перезапустить проверку исправления в Search Console, не раньше.
