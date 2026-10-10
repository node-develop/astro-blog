# artka.dev: разметка, скорость, изображения, вид на мобильных

Дата проверки: 2026-10-10. Исходники: `/home/claude/astro-blog`, коммит `b9526c5` (2026-10-05). Живой сайт проверялся через curl и Playwright (Chromium из claude-seo).

## Оценки

| Область | Оценка | Коротко |
|---|---|---|
| Schema (JSON-LD) | **85/100** | Один связный `@graph` на каждой странице, синтаксис чистый, валидатор claude-seo ошибок не нашёл. Минусы: уроки не размечены как статьи, обрезанный и искажённый `articleBody`, дубли сущностей в `Person.subjectOf`. |
| Performance (лаб.) | **78/100** | LCP отличный на всех типах страниц, но на мобильном профиле TBT 400-550 мс (GA4 и тяжёлый HTML статей), на десктопе главной CLS 0,06-0,09 из-за подмены шрифта. Полевых данных нет. |
| Images | **85/100** | Alt и размеры есть везде, AVIF/WebP через `<picture>`, ленивые только ниже первого экрана, OG-картинки 1200x630 у всех типов страниц. Минусы: OG без кэша, `avatar-512.png` 233 КБ и не квадрат, у статей одна картинка одного соотношения сторон. |

Ограничения измерений:
- **PageSpeed Insights API недоступен**: ответ `429 RESOURCE_EXHAUSTED`, исчерпана дневная квота общего бесключевого проекта. CrUX и `lcp_subparts.py` требуют ключ Google API, его нет. Поэтому все цифры скорости ниже лабораторные, из собственного замера Playwright, а не Lighthouse.
- Профиль «мобильный»: 412x823, DPR 2,625, задержка 150 мс, 1,44 Мбит/с, CPU x4, кэш выключен. Профиль «десктоп»: 1350x940 без ограничений. Это близко к профилям Lighthouse, но не равно им, и TBT здесь считается по `longtask` после FCP.
- Браузер ходил через прокси окружения, поэтому протокол в замере показан как HTTP/1.1. Прямой `curl --http2` подтверждает, что сервер отдаёт HTTP/2.
- `preload_check.py` отказался работать из-за прокси на 127.0.0.1 (защита url_safety), проверил подсказки загрузки вручную.

## Что было в аудите 3 октября и что с этим сейчас

| Замечание 3 октября | Сейчас | Вывод |
|---|---|---|
| Висячий `@id`: на RU `workTranslation` указывает на `#website-en`, на EN `translationOfWork` на `#website` | Есть на всех 20 проверенных страницах | Сделано намеренно, исключение прописано в `src/lib/seo/graph-refs.ts:52-63`. Для JSON-LD это обычная ссылка на IRI в другом документе, не ошибка. Понижаю до Info, см. S5. |
| Шрифт Unbounded latin (50 КБ) предзагружается на RU | Есть, `BaseLayout.astro:142` | **Не проблема.** H1 на RU содержит латиницу («Claude Code», «AI», «production backend»), браузер скачивает latin-подмножество на RU-главной в любом случае. Предзагрузка правильная. Закрываю. |
| GA4 181 КБ вместе с Plausible | Есть: `gtag/js` 183 317 байт (zstd) на каждой странице | Теперь грузится после `load` и в простое (`GoogleAnalytics.astro`), на первый экран не влияет, но даёт длинные задачи на мобильных. См. P2. |
| Нет preconnect | Нет | **Не нужен.** Сторонних ресурсов на первом экране нет: GA и Plausible грузятся после `load`. Preconnect к ним только занял бы соединение раньше времени. Закрываю. |
| OG-картинки и страницы статей с `Cache-Control: max-age=0` | Есть: все `/og/*.png`, статьи, уроки, `robots.txt`, `sitemap-*.xml`, `rss.xml` | Подтверждено. См. P4. |

## Что работает

- **Один граф на страницу.** На каждой странице ровно один блок `application/ld+json`, `@context: https://schema.org`, все ссылки `@id` внутри страницы разрешаются (кроме намеренной межъязыковой, см. выше). Узлы Person, Organization, WebSite есть везде и ссылаются друг на друга.
- **Типы выбраны правильно**: BlogPosting и ItemPage на статьях, ProfilePage с `mainEntity: #person` на `/about/`, CollectionPage и ItemList на `/blog/` и тегах, Course и LearningResource на курсе, BreadcrumbList на всех внутренних страницах. Устаревших типов (HowTo, SpecialAnnouncement, CourseInfo, ClaimReview) нет.
- **Даты совпадают с видимыми**: `datePublished 2026-05-02` и `dateModified 2026-09-19` на `/blog/json-ld-graph-astro/` равны `<time>` на странице («2 мая 2026 г.», «Обновлено 19.09.2026»).
- **Person достаточно сильный**: `name`, `alternateName` (кириллица), `url`, `image`, `jobTitle`, `description`, `knowsAbout` (30 пунктов), `sameAs` на GitHub, LinkedIn, X, Telegram, `email`.
- **LCP быстрый везде.** LCP-элемент всегда текст (H1 или лид), картинок в критическом пути нет.
- **Сжатие**: HTML, CSS, JS, XML отдаются в `br`; хешированные `/_astro/*` с `max-age=31536000, immutable`; иконки и аватар с `max-age=604800` (правило Traefik из `docs/runbooks/dokploy-static-cache.md` работает).
- **Изображения**: все `<img>` имеют `width`/`height`; аватар отдаётся через `<picture>` с AVIF (1,5 КБ) и WebP (2,1 КБ); декоративные аватары с пустым `alt`; Mermaid-схемы с осмысленным `alt` («BlogPosting ссылается на Person как на автора…»).
- **OG**: у каждого типа страницы свой `og:image` 1200x630, `og:image:width/height/alt`, `twitter:card=summary_large_image`, все проверенные отдают 200 и весят 14-36 КБ. `max-image-preview:large` стоит.
- **Мобильная вёрстка**: H1 и основная кнопка видны на первом экране, горизонтального скролла нет, базовый шрифт 16 px, нет баннеров cookies, всплывающих окон и перекрывающих элементов.

## Замеры скорости (лаборатория Playwright)

| Страница | Профиль | TTFB | FCP | LCP | CLS | TBT | Байт всего | Сторонние | DOM |
|---|---|---|---|---|---|---|---|---|---|
| `/` | мобильный | 721 мс* | 1192 мс | 1192 мс (H1) | 0,002 | 403 мс | 363 КБ | 186 КБ (51%) | 368 |
| `/en/` | мобильный | 205 мс | 644 мс | 644 мс (H1) | 0 | 395 мс | 308 КБ | 186 КБ (61%) | 367 |
| `/blog/claude-code-video-guide/` | мобильный | 214-798 мс | 1468-1916 мс | = FCP (лид) | 0-0,014 | 488-544 мс | 456 КБ | 188 КБ (41%) | **2508** |
| `/courses/claude-code-guide/03-claude-md/` | мобильный | 222 мс | 1108 мс | 1108 мс | 0 | 550 мс | 422 КБ | 186 КБ (44%) | 348 |
| `/` | десктоп 1350 | 198-215 мс | 500 мс | 740 мс | **0,088** | 33-110 мс | 362 КБ | 186 КБ | 368 |
| `/blog/claude-code-video-guide/` | десктоп 1350 | 196 мс | 748 мс | 748 мс (H1) | 0,010 | 23 мс | 458 КБ | 190 КБ | 2508 |

\* Первый холодный запрос. TTFB по curl из контейнера через прокси: 0,36-0,75 с.

Состав веса на статье (мобильный): шрифты 197 КБ (6 файлов woff2), скрипты 195 КБ (из них GA4 183 КБ), HTML 52 КБ в `br` (325 КБ без сжатия), CSS 8 КБ.

## Находки

### P1. Подмена веб-шрифта двигает вёрстку главной на десктопе (CLS 0,06-0,09)
**Важность: Medium.**
- Доказательство: `/` на 1350x940 CLS 0,088 в двух прогонах подряд, на 1920x1080 0,057, на 1366x768 0,066. Главный сдвиг (0,073-0,087) приходит в момент загрузки `unbounded-latin-wght-normal.woff2` (ответ на 1310 мс, сдвиг на 1329 мс) и задевает `ASIDE.ticker`, `NAV.topics`, `ARTICLE.featured`. С заблокированными шрифтами сдвигов ноль. До порога 0,1 запас минимальный: любое изменение заголовка или ленты переведёт главную в «нужно улучшить».
- Причина: `font-display: swap` без метрик запасного шрифта. В `src/styles/tokens.css:22` запасной для Unbounded `"Arial Black"`, для Golos `ui-sans-serif, system-ui` (`tokens.css:24`); ни `size-adjust`, ни `ascent-override` в `src/styles/*.css` нет.
- Исправление: добавить `@font-face` запасного шрифта с подобранными `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` (вручную или через `fontaine`/`capsize`) и поставить его вторым в `--font-serif` и `--font-sans`. Альтернатива для H1: фиксированная `min-height` у блока заголовка, но метрики надёжнее. Проверка: тот же прогон на 1350x940, CLS ниже 0,02.

### P2. GA4 даёт основную часть TBT на мобильных
**Важность: Medium.**
- Доказательство: `https://www.googletagmanager.com/gtag/js?id=G-X53SL63MK2` 183 317 байт на каждой странице, это 41-61% всего веса страницы. На мобильном профиле длинные задачи после `load` 94-265 мс каждая (например, статья: 2312 мс 99 мс, 2467 мс 152 мс, 3879 мс 265 мс, 4145 мс 176 мс), TBT 395-550 мс против 23-110 мс на десктопе. Plausible (2,2 КБ) уже стоит рядом и даёт ту же базовую аналитику.
- Источник: `src/layouts/BaseLayout.astro:307` (`<Analytics domain="artka.dev" gaId="G-X53SL63MK2" />`), `src/components/Analytics.astro:39-40`, `src/components/GoogleAnalytics.astro`.
- Исправление по убыванию выгоды: (а) убрать `gaId` и оставить Plausible, если GA4 не нужен для связки с Search Console или рекламой; (б) если нужен, грузить GA только после первого взаимодействия (scroll, pointerdown, keydown) вместо `requestIdleCallback` после `load`; (в) перенести через Partytown в веб-воркер. Ожидаемый эффект на мобильных: TBT ниже 200 мс, вес страницы минус 183 КБ.

### P3. Тяжёлый HTML статей и большой DOM
**Важность: Medium.**
- Доказательство: `/blog/claude-code-video-guide/` 325 КБ HTML без сжатия (52 КБ в `br`), DOM 2508 элементов (порог внимания 1500). `/blog/json-ld-graph-astro/` 251 КБ: из них встроенные стили 58 КБ, data URI Mermaid 55 КБ (две копии схемы, светлая и тёмная, по 27-30 КБ), JSON-LD 17 КБ. На мобильном профиле первая длинная задача парсинга и раскладки 474-557 мс, она стоит до FCP и отодвигает его до 1,5-1,9 с против 1,1 с на уроке с DOM 348.
- Исправление:
  1. Mermaid: отдавать SVG отдельными файлами (`<img src="/diagrams/<hash>.svg" width height loading="lazy">`) вместо двух data URI в HTML. Тёмную версию через `<picture><source media="(prefers-color-scheme: dark)">`. Минус ~55 КБ HTML на статью со схемой, файлы кэшируются.
  2. Подсветка кода shiki даёт тысячи `<span>`: для длинных листингов включить `transformerCompactLineOptions` или свернуть строки в один токен, где цвет не меняется; длинные блоки кода сворачивать в `<details>`.
  3. Встроенные стили ~50-58 КБ повторяются в каждом HTML (`inline-style` во всех проверенных страницах). Выставить `build.inlineStylesheets: "auto"` с порогом (по умолчанию 4 КБ) в `astro.config.ts`, чтобы общий CSS уходил в кэшируемый файл.

### P4. OG-картинки, статьи, уроки и служебные файлы без кэша браузера
**Важность: Low** (на SEO влияет косвенно, на соцсети и повторные визиты прямо).
- Доказательство: `Cache-Control: public, max-age=0` у `/og/landing/home-ru.png`, `/og/json-ld-graph-astro-ru.png`, `/og/lesson/claude-code-guide/03-claude-md-ru.png` и всех остальных проверенных `/og/*`; у `/blog/json-ld-graph-astro/` и `/courses/claude-code-guide/03-claude-md/` (предрендер, отдаётся статическим обработчиком адаптера, ETag и Last-Modified есть); у `/robots.txt`, `/sitemap-ru.xml`, `/rss.xml` (334 КБ без сжатия). SSR-главная при этом уже отдаёт `public, max-age=300, stale-while-revalidate=3600` (`src/lib/http/public-cache.ts:12`).
- Причина: правило Traefik из `docs/runbooks/dokploy-static-cache.md` покрывает только `/avatar-`, `/icon-`, `/favicon`, `/apple-touch-icon`, `/site.webmanifest`, `/pagefind/`, `/humans.txt`.
- Исправление: в `/etc/dokploy/traefik/dynamic/blog-static-cache.yml` добавить `PathPrefix(\`/og/\`)` с `max-age=604800` (имена OG без хеша, неделя разумна). Для предрендеренных HTML отдельный роутер с `public, max-age=300, stale-while-revalidate=3600`, тем же значением, что у SSR, правилом по `Path` с завершающим `/` и исключением `/admin/`, `/api/`. Обновить таблицу «What is covered» в ранбуке.

### S1. Уроки курса не размечены как статьи
**Важность: Medium** (28 страниц, это треть всех URL в карте сайта).
- Доказательство: `/courses/claude-code-guide/03-claude-md/` и EN-двойник: главный узел `LearningResource` с `ItemPage`. У Google нет расширенного результата для LearningResource, а свойства, по которым он читает автора и даты статьи (`headline`, `image`, `author`, `datePublished`), он берёт у типов Article/BlogPosting. У узла нет `headline` и `image`, у `ItemPage` нет `primaryImageOfPage`, хотя OG-картинка урока есть (`/og/lesson/claude-code-guide/03-claude-md-ru.png`, 200, 1200x630).
- Источник: `src/lib/seo/nodes-page.ts:363-393` (`buildLearningResourceNode`), `src/layouts/LessonLayout.astro:100-123`.
- Исправление: сделать узел урока двухтиповым `"@type": ["LearningResource", "Article"]`, добавить `headline` (= `name`), `image` (OG урока), `mainEntityOfPage: {"@id": "<canonical>#webpage"}`, `wordCount`; в `buildWebPageNode` для урока передать `primaryImageOfPage`.

### S2. `articleBody` обрезан и испорчен вырезанием кода
**Важность: Low.**
- Доказательство: у BlogPosting на `/blog/json-ld-graph-astro/` `articleBody` 5188 символов при `wordCount: 2761`, то есть это начало статьи, а не текст. Из него вырезан встроенный код без замены, предложения рвутся: «Узел ссылался через на узел блога», «чем безопасно вставлять JSON внутрь , и что». Сейчас это 5 КБ испорченного текста в каждой статье, которые поисковик сравнивает с видимым текстом.
- Источник: `src/lib/seo/article-body.ts:27-35` (удаляются `code`, `inlineCode`, `html`), `src/layouts/PostLayout.astro:105` (`extractArticleBody(post.body ?? "", 800)`), `src/lib/seo/nodes-page.ts:72`.
- Исправление: проще всего убрать `articleBody` (у Google нет обязательных свойств Article, текст он берёт со страницы). Если оставлять: `inlineCode` заменять его текстом (`value`), а не удалять; удалять только блоки `code` и `html`.

### S3. `Person.subjectOf` дублирует курс и сайт анонимными узлами
**Важность: Low.**
- Доказательство: на всех страницах `Person.subjectOf` содержит два анонимных `CreativeWork`: «Claude Code Guide (RU, 14 lessons)» с `url` курса и «artka.dev, personal blog» с `url` главной. Это те же сущности, что `Course #course` и `WebSite #website`, но без `@id`, поэтому в графе это два новых объекта. Кроме того, `subjectOf` означает «работа, в которой человек является темой», а не «работа, которую человек создал».
- Источник: `src/lib/seo/nodes-global.ts:41`.
- Исправление: убрать `subjectOf`. Связь автора с работами уже есть с обратной стороны (`Course.author`, `WebSite.publisher` и `Organization.founder`). Если нужна прямая связь от Person, использовать ссылки по `@id`: `"workExample": [{"@id": "https://artka.dev/courses/claude-code-guide/#course"}, {"@id": "https://artka.dev/#website"}]`.

### S4. Мелкие неточности в Person, Project и Lesson
**Важность: Low.**
- `jobTitle: "Full-stack & AI engineer · LLM/agent workflows · backend"` (`src/lib/seo/person.ts:37`): это слоган, а не должность. Для сущности автора лучше короткое `"AI Automation Engineer"` или `"Senior Backend & AI Engineer"`; нынешний текст оставить в `description`. Нет `worksFor` (текущий работодатель) и `alumniOf`, это бесплатные сигналы для связи сущности.
- `Person.image` = `https://artka.dev/avatar-512.png` (`person.ts:36`): PNG 500x512 (не квадрат, хотя имя файла обещает 512x512) и 233 658 байт. Экспортировать квадрат 512x512 в JPEG/WebP около 30-40 КБ.
- `CreativeWork.contributor: "Solo: design, backend, frontend, SEO, deploy"` на `/projects/astro-blog/` (`src/lib/seo/nodes-projects.ts:76`): `contributor` ожидает Person или Organization. Убрать, роль описать в `description`. Для программного проекта точнее тип `SoftwareSourceCode` с `codeRepository` (если репозиторий публичный) и `programmingLanguage`.
- `LearningResource.teaches: "claude-code, guide"` (`src/layouts/LessonLayout.astro:112` передаёт теги курса): это теги, а не чему учит урок. Либо убрать, либо брать из frontmatter урока конкретные навыки.

### S5. Межъязыковые ссылки WebSite (бывший «висячий @id»)
**Важность: Info.**
- Доказательство: RU-страницы `workTranslation: {"@id": "https://artka.dev/#website-en"}`, EN-страницы `translationOfWork: {"@id": "https://artka.dev/#website"}`, целевой узел на странице отсутствует. Валидатор claude-seo и JSON-парсер ошибок не дают; по спецификации JSON-LD это ссылка на ресурс в другом документе.
- Наблюдение: в кодовой базе сейчас два разных решения одной задачи. Для уроков похожую ссылку на курс закрыли минимальным узлом с тем же `@id` (`nodes-page.ts:376-385`, комментарий «A bare reference … resolved to nothing on all 28 lesson pages»), а для WebSite оставили исключение в линтере (`graph-refs.ts:52-63`).
- Исправление (если хочется единообразия): тем же приёмом, что у уроков, вставить вместо голой ссылки минимальный узел `{"@type": "WebSite", "@id": "https://artka.dev/#website-en", "url": "https://artka.dev/en/", "inLanguage": "en-US"}` в `nodes-global.ts:89-91` и убрать исключение из `crossLocaleGlobalIds`. Польза для поиска не доказана, это вопрос чистоты графа.

### S6. FAQPage на 4 статьях из 9
**Важность: Info.**
- Доказательство: `FAQPage` на `/blog/json-ld-graph-astro/` и EN-двойнике, всего `faq:` во frontmatter у 4 из 9 RU-постов (`src/content/posts`). Google убрал FAQ-сниппеты для всех сайтов 7 мая 2026 года, документацию удалил 15 июня 2026.
- Действие: удалять не обязательно, вреда нет. Новых FAQ ради выдачи Google не добавлять; польза для ИИ-ответов не подтверждена.

### S7. Возможности, которых сейчас нет
**Важность: Low.**
- У BlogPosting одна картинка 1200x630 (16:9 условно). Google для Article и Discover советует несколько изображений 16:9, 4:3 и 1:1 шириной от 1200 px. Генератор OG на satori уже есть; добавить варианты 1200x900 и 1200x1200 и отдавать `image` массивом.
- На главной WebSite без `potentialAction: SearchAction`: поле окна поиска в выдаче Google больше не показывает, добавлять ради выдачи не нужно; можно ради машинной читаемости, поиск на сайте (Pagefind) есть.
- Course один, поэтому карусель курсов (нужно от 3 Course в ItemList) недоступна; `CourseInstance` без `courseWorkload` (`nodes-page.ts:321-325`, поле `workload` не заполнено во frontmatter курса). Расширенный результат Course Info снят в июне 2025, так что это не ошибка.

### I1. Изображения: сводка

| Метрика | Значение |
|---|---|
| Всего `<img>` на 20 проверенных страницах | 17 (аватары и Mermaid) |
| Без `alt` | 0 (аватары рядом с именем автора с пустым `alt`, это правильно) |
| Без `width`/`height` | 0 |
| В `<picture>` с AVIF/WebP | все аватары |
| `loading="lazy"` выше первого экрана | нет (аватар на `/about/` eager) |
| `fetchpriority="high"` | не нужен: LCP везде текст |
| OG-картинки | у всех 9 проверенных типов 200, `image/png`, 1200x630, 14-36 КБ, кэш `max-age=0` (P4) |

Отдельно: обложки статей на сайте по сути отсутствуют (на `/blog/json-ld-graph-astro/` блок `post__art` это CSS-графика), поэтому для Google Images и Discover у статей нет собственных изображений, кроме OG. Если цель Discover, нужна реальная картинка в теле статьи шириной от 1200 px.

### V1. Визуальные мелочи на мобильных и десктопе
**Важность: Low.**
Скриншоты: `../screenshots/home-desktop.png`, `../screenshots/home-mobile.png`, `../screenshots/article-desktop.png`, `../screenshots/article-mobile.png`.
- **В оглавлении торчит «#»**: пункты выглядят как «1. Что такое @graph по спецификации#». Видно в боковом оглавлении на десктопе и в `mobile-toc__link`. Причина: `rehype-autolink-headings` добавляет `<span>#</span>` внутрь заголовка (`src/lib/markdown/autolink.ts:28-35`), а Astro собирает `headings[].text` уже с этим символом; оглавление строит `src/lib/posts/toc.ts:23`. Тот же символ попадает в текст самих H2 для поисковика. Исправление: рисовать «#» через CSS `::after` у `.heading-anchor` и оставить ссылку пустой с `aria-label`, либо срезать хвостовой `#` в `buildTocTree`.
- **Кнопка поиска с пустым местом**: на скриншотах (Chromium, Linux) в кнопке `site-header__search` видна только лупа в углу, подпись `⌘K` не отрисовалась. На телефонах клавиатурной подсказки не должно быть вовсе: скрыть `.site-header__search-key` через `@media (pointer: coarse)` и показывать `Ctrl K` вне macOS.
- **H1 с отрицательным межстрочным интервалом**: строки «CLAUDE CODE,» и «AI-АГЕНТОВ» наползают, низ первой строки перекрыт плашкой выделения (и на мобильном, и на десктопе). Это стиль, но читаемость страдает; поднять `line-height` H1 до 0,95-1,0.
- **Маленькие цели нажатия** (375 px): ссылка логотипа 102x14 px, ссылка «X» в подвале 11x20 и 10x32 px, «Telegram/GitHub/LinkedIn» по 20 px высотой, якоря заголовков 20x21 px. Рекомендация от 24x24 (WCAG 2.2), лучше от 44-48 px: добавить `padding` ссылкам подвала и логотипу.
- Баннеров cookies, всплывающих окон, перекрывающих блоков нет. H1 и кнопки «Все статьи», «Назначить встречу» на первом экране. На мобильной статье блок «Содержание» и крошки стоят над H1, но H1 всё равно начинается в верхней трети экрана (около 260 px из 812).

### P5. Запрос сессии на каждой публичной странице
**Важность: Low.**
- Доказательство: каждая страница у анонимного посетителя делает `GET /api/auth/get-session/` (`no-store`, 987 байт), то есть обращение к серверу и БД на каждый просмотр, включая рендер Googlebot.
- Источник: `src/layouts/BaseLayout.astro:554-566`.
- Исправление: вызывать проверку только если есть cookie сессии Better-Auth (`document.cookie.includes("better-auth.session")` или флаг-cookie без `HttpOnly`, который ставит сервер при входе), либо только на страницах уроков, где нужен прогресс.

## Что сделать в первую очередь

1. P1: метрики запасного шрифта (CLS на десктопе главной).
2. P2: убрать GA4 или грузить по первому взаимодействию (TBT на мобильных, минус 183 КБ на каждой странице).
3. S1: двухтиповая разметка уроков `LearningResource` + `Article` с `headline` и `image` (28 страниц).
4. P3: Mermaid в отдельные SVG-файлы и общий CSS в кэшируемый файл.
5. P4: добавить `/og/` и предрендеренный HTML в правило кэша Traefik.
6. S2, S3, V1: `articleBody`, `subjectOf`, «#» в оглавлении.

Повторить замер через PageSpeed Insights с собственным ключом API, когда он появится: сейчас квота общего проекта исчерпана, а CrUX без ключа недоступен.
