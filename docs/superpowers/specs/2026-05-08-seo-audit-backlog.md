# SEO Audit Backlog (2026-05-08)

Источник: внешний SEO-аудит главной `https://artka.dev/` от 2026-05-08
Sanity-check против кода: см. секцию **Audit reconciliation** ниже
Связанные узлы кода: `src/layouts/BaseLayout.astro`, `src/pages/index.astro`,
`src/components/SiteSidebar.astro`, `src/components/Header.astro`,
`src/lib/seo/{person,schema,nodes-global,nodes-page,json-ld}.ts`,
`src/i18n/strings.{ru,en}.json`.

Любая задача, меняющая UI-копию, обязана:
1. Править обе локали в `src/i18n/strings.{ru,en}.json`.
2. Прогнать `pnpm translate` (per-key hash tracking подхватит изменённые ключи).
3. Закоммитить `RU + EN diff` одним коммитом.

---

## Audit reconciliation (что именно подтверждено)

| # | Claim | Verdict | Главная улика |
|---|-------|---------|---------------|
| 1 | `<title>` главной = "artka.dev" (9 chars) | CONFIRMED | `src/pages/index.astro:18` |
| 2 | Meta desc 89 chars, без CTA | PARTIAL | реально 86 chars, CTA отсутствует |
| 3 | Дубль `<h2>Claude Code Guide</h2>` + h2 "Другие статьи" | CONFIRMED | `index.astro:34`, `SiteSidebar.astro:54,78`, плюс `index.astro:42` — 4 h2 на одной странице |
| 4 | Footer пустой | CONFIRMED | `BaseLayout.astro:184-189` |
| 5 | `aria-label="Статьи"` на бренде врёт | CONFIRMED | `Header.astro:39` ведёт на `/`, label = "Статьи" |
| 6 | `Person.sameAs: []` | CONFIRMED | `person.ts:47` |
| 7 | Нет видимого author byline на главной | CONFIRMED | `src/pages/index.astro` целиком |
| 8 | Нет BreadcrumbList JSON-LD | PARTIAL | на постах есть (`PostLayout.astro:74-78`); отсутствует на index/blog/about/now/uses/projects/courses |
| 9 | Нет BlogPosting JSON-LD per-post | **DEBUNKED** | `PostLayout.astro:61-72` + `nodes-page.ts:19` уже строят BlogPosting |
| 10 | `og:image:secure_url` указывает на SVG | CONFIRMED | `BaseLayout.astro:72-74,122` |
| 11 | `Person.subjectOf` — два CW с одним URL `/blog` | CONFIRMED | `person.ts:51-67` (notableWork[0] и notableWork[2]) |
| 12 | Нет WebPage / CollectionPage в графе | CONFIRMED | `schema.ts:20-31` глобально кладёт только Person + Organization + WebSite; `buildWebPageNode` существует, но не вызывается |
| 13 | `og:locale:alternate` отсутствует | CONFIRMED | `BaseLayout.astro:118` |
| 14 | Нет preconnect к Plausible | CONFIRMED | в `BaseLayout` нет; `Analytics.astro` тоже не ставит |
| 15 | Шрифты не preload-ятся | NOT_APPLICABLE | в `public/fonts/` нет web-fonts; `var(--font-*)` = system stack |
| 16 | `/api/auth/get-session` без `requestIdleCallback` | CONFIRMED | `BaseLayout.astro:277-289` |
| 17 | 3 latest-поста с одной датой 2026-05-02 | CONFIRMED (контент) | три md-файла действительно с одинаковой `pubDate` — это факт, а не баг рендера |
| 18 | Per-post OG не используются | **DEBUNKED** | `src/pages/og/[slug].png.ts` + `PostLayout.astro:40,94` — работает; default используется только на нон-постах |
| 19 | Нет `/feed.json` | CONFIRMED | только `rss.xml.ts` |
| 20 | На посте нет видимого byline (только дата) | PARTIAL | имя автора есть в `AuthorCard` внизу, но не над сгибом |
| 21 | Course-card повторяется 16 раз на главной | CONFIRMED | course-card + sidebar h2 + 14 уроков |

### Что аудит пропустил (расширения от critic)

- **EXT-1.** На мобайле sidebar рендерится ДВАЖДЫ в DOM (`BaseLayout.astro:170-176`): внутри `<MobileDrawer>` и в `.layout__sidebar`. Индексаторы видят ~32 ссылки курса, не 16.
- **EXT-2.** Landing pages (`/`, `/blog`, `/courses/claude-code-guide`, `/about`) шарятся в соцсети одной generic-картинкой `/og-default.png` без заголовка. Per-page OG только для постов.
- **EXT-3.** `<link rel="alternate" type="application/rss+xml" title={title}>` (`BaseLayout.astro:157`) использует **title страницы**, а не feed-title. В аггрегаторах feed будет называться по последней посещённой странице.
- **EXT-4.** RSS hardcoded на RU (`rss.xml.ts`): title="Personal Blog", description="Свежие публикации". `rssHref` для EN-локали → `/en/rss.xml`, который **не существует** → 404 для всех EN-страниц.
- **EXT-5.** `Organization.logo = /favicon.svg` (`nodes-global.ts:46`). Google Rich Results требует raster ≥112×112.
- **EXT-6.** `articleBody` в BlogPosting JSON-LD = первые 800 символов excerpt (`PostLayout.astro:59`). Для длинных постов значение mismatch с реальным телом → лучше пометить как `abstract` либо отдавать целиком.

---

## Phase 0 — Investigations

### SEO-1: Решение по "трём постам с одной датой 2026-05-02"
**Priority:** P0
**Effort:** XS (15 min)
**Owner:** content-author
**Files:**
- `src/content/posts/json-ld-graph-astro.md`
- `src/content/posts/robots-txt-ai-crawlers-2026.md`
- `src/content/posts/mermaid-svg-playwright-build-time.md`
**Acceptance:**
- [ ] Принято решение: оставить как есть (если посты реально опубликованы в один день) **или** разнести `pubDate` по реальным датам публикации.
- [ ] Если разнесли — обновлены EN-зеркала + `pnpm translate`.
- [ ] Latest-список на `/` показывает три разные даты, либо в `index.astro` `.latest__list` добавлено явное группирование "Опубликовано 2 мая" чтобы визуально не казалось багом.
**Depends on:** —
**Notes:** Critic подтвердил: даты в frontmatter реально одинаковые, это не баг рендера.

### SEO-2: Аудит sitemap-index.xml (RU + EN coverage)
**Priority:** P1
**Effort:** XS
**Owner:** backender
**Files:**
- `astro.config.mjs` (конфиг `@astrojs/sitemap`)
- `dist/sitemap-*.xml` после `pnpm build`
**Acceptance:**
- [ ] sitemap-index содержит все RU + EN URL: `/`, `/blog`, `/blog/<slug>`, `/courses/claude-code-guide`, `/courses/claude-code-guide/<lesson>`, `/about`, `/now`, `/uses`, `/projects` и их `/en/` зеркала.
- [ ] Документировано, есть ли `/tags/<tag>` URLs (если SEO-19 их добавит — обновить sitemap).
- [ ] Документировано, корректно ли `<lastmod>` для каждого URL.
**Depends on:** —

### SEO-3: Inventory внешних origins для preconnect
**Priority:** P3
**Effort:** XS
**Owner:** frontender
**Files:**
- `src/components/Analytics.astro`
- `src/components/Comments.astro` (Giscus)
- `src/components/Newsletter.astro` (Buttondown)
**Acceptance:**
- [ ] Список всех hostnames, к которым стартует запрос на main pages: plausible.io, giscus.app, buttondown.email, gravatar (если есть).
- [ ] Решение: какие из них стоит preconnect-нуть в head (только critical-path), какие — нет.
**Depends on:** —

---

## Phase 1 — P0 / Quick wins (CTR-blockers)

### SEO-4: Title-шаблоны для всех типов страниц
**Priority:** P0
**Effort:** S (1 ч)
**Owner:** frontender + content-author
**Files:**
- `src/pages/index.astro:18` (главная)
- `src/pages/blog/index.astro` (архив)
- `src/layouts/PostLayout.astro` (формат для постов)
- `src/pages/courses/[course]/index.astro`, `src/pages/courses/[course]/[lesson].astro`
- `src/pages/tags/[tag].astro` (если существует)
- `src/i18n/strings.{ru,en}.json` (новые ключи `meta.home.title`, `meta.blog.title`, `meta.tag.title`)
**Acceptance:**
- [ ] Главная RU: `Claude Code, AI-агенты и Astro — записки из продакшна | artka.dev` (точная фраза из аудита).
- [ ] Главная EN: `Claude Code, AI agents, and Astro — notes from production | artka.dev`.
- [ ] Архив `/blog`: `Все заметки — backend, AI-агенты, Claude Code | artka.dev` (RU) / эквивалент EN.
- [ ] Пост: `{post.title} | artka.dev`.
- [ ] Урок: `{N}. {lesson.title} — Claude Code Guide | artka.dev`.
- [ ] Тег: `{tag} — все заметки | artka.dev` (RU) / `{tag} — all notes | artka.dev` (EN).
- [ ] Все строки в обеих локалях, прогнан `pnpm translate`.
**Depends on:** —
**Notes:** Самый высокий CTR-плечо. Текущий `<title>artka.dev</title>` оставляет ~50 символов SERP-площади пустыми.

### SEO-5: Meta description главной — расширить и добавить CTA
**Priority:** P0
**Effort:** XS
**Owner:** content-author
**Files:**
- `src/i18n/strings.{ru,en}.json` (`meta.home.description`)
**Acceptance:**
- [ ] RU: 145–160 символов, упоминает "14 уроков Claude Code Guide", темы (harness, agent loop, MCP, hooks, Astro), заканчивается CTA ("Читать →" / "Открыть гайд").
- [ ] EN: 145–160 символов, аналогично.
- [ ] Visual check: Google SERP preview не обрезает description.
**Depends on:** —

### SEO-6: Починить h2-иерархию + aria-label бренда
**Priority:** P0
**Effort:** S
**Owner:** frontender
**Files:**
- `src/components/SiteSidebar.astro:54,78` (h2 → h3 или semantic non-heading label)
- `src/pages/index.astro:34,42` (оставить ровно один h2 в main: либо course-card, либо latest — решить)
- `src/components/Header.astro:39,44` (исправить misleading `aria-label="Статьи"` → "На главную"/"Home" для бренда; navigation `<nav>` оставить как есть либо переименовать ключ `nav.posts` отдельно для брендовой ссылки)
- `src/i18n/strings.{ru,en}.json` (новый ключ `nav.brandHome` или подобный)
**Acceptance:**
- [ ] На главной ровно один `<h2>` в `<main>` (вне sidebar).
- [ ] Sidebar секции — `<h3>` (или `<p>` с `aria-labelledby`).
- [ ] Lighthouse a11y "Heading order" = pass.
- [ ] `aria-label` бренд-ссылки соответствует её действию.
**Depends on:** —

### SEO-7: Убрать SVG из og:image:secure_url
**Priority:** P0
**Effort:** XS
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:72-74,122`
**Acceptance:**
- [ ] Удалена локальная переменная `absoluteOgImageSvg` и тег `<meta property="og:image:secure_url">` (либо `secure_url` указывает на тот же PNG, что и `og:image`).
- [ ] В `<head>` нет тега, ссылающегося на `.svg` как OG-изображение.
- [ ] Twitter Card validator проходит без warning по SVG.
**Depends on:** —

### SEO-8: Заполнить Person.sameAs + raster-аватар
**Priority:** P0
**Effort:** S
**Owner:** content-author + frontender
**Files:**
- `src/lib/seo/person.ts:32-33,46-47` (удалить TODO, заполнить значения)
- `public/avatar-512.png` (новый, square ≥512×512, < 200 KB)
**Acceptance:**
- [ ] `sameAs` содержит минимум 3 реальных URL (GitHub, LinkedIn, X / Mastodon / Telegram).
- [ ] `image` указывает на `/avatar-512.png`.
- [ ] Файл существует в `public/`, проходит manual visual check.
- [ ] TODO-комментарии удалены.
**Depends on:** —
**Notes:** Разблокирует SEO-12 и SEO-13.

### SEO-9: Уникальные description для всех постов
**Priority:** P0
**Effort:** S
**Owner:** content-author + backender
**Files:**
- `src/content.config.ts` (поле `description` → `.min(80).max(170)` обязательное)
- `src/content/posts/**/*.md` (frontmatter `description`)
- `src/layouts/PostLayout.astro` (если был фолбэк — оставить только на переходный период)
**Acceptance:**
- [ ] Schema требует `description` 80–170 chars; build падает на постах без него.
- [ ] Все существующие RU + EN посты имеют валидный `description`.
- [ ] Spot-check 5 постов в Google SERP preview — ни одно описание не обрезается, не повторяет title.
**Depends on:** —

### SEO-10: Починить дубль Person.subjectOf
**Priority:** P0
**Effort:** XS
**Owner:** backender
**Files:**
- `src/lib/seo/person.ts:51-67`
**Acceptance:**
- [ ] `notableWork[0].url` указывает на `/courses/claude-code-guide` (не `/blog`).
- [ ] `notableWork[2].url` указывает на `/tags/ai-agents` или `/tags/agent-engineering` (после SEO-19) либо на конкретный пост-серию.
- [ ] Никакие два узла в `Person.subjectOf` не имеют одинаковый URL.
**Depends on:** —
**Notes:** Если SEO-19 ещё не сделан, временно поставить `${SITE}/blog?tag=ai-agents` или промежуточный URL.

### SEO-11: Починить RSS-метаданные + создать `/en/rss.xml`
**Priority:** P0
**Effort:** S
**Owner:** backender
**Files:**
- `src/pages/rss.xml.ts` (исправить hardcoded "Personal Blog" → актуальный brand+description; добавить параметризацию locale)
- `src/pages/en/rss.xml.ts` (новый файл, EN-feed)
- `src/layouts/BaseLayout.astro:157` (`title` атрибут RSS-link не должен быть равен `title` страницы — задать константу feed-title через i18n)
**Acceptance:**
- [ ] `/rss.xml` имеет title `artka.dev — Записки из продакшна` (или эквивалент), description = одно предложение про блог.
- [ ] `/en/rss.xml` существует и валиден; больше не 404 для EN-страниц.
- [ ] `<link rel="alternate" type="application/rss+xml" title="…">` использует константу `meta.feed.title` из i18n, а не `title` страницы.
- [ ] Lints feed validator проходит без warning.
**Depends on:** —
**Notes:** Critic-finding EXT-3 + EXT-4. Сейчас EN-страницы шлют браузер на 404.

---

## Phase 2 — P1 / Author identity & E-E-A-T

### SEO-12: Видимый author-byline над сгибом на постах
**Priority:** P1
**Effort:** M (half-day)
**Owner:** frontender
**Files:**
- `src/components/PostMeta.astro` (или новый `AuthorByline.astro`)
- `src/layouts/PostLayout.astro` (вставить byline под h1, до контента)
- `src/i18n/strings.{ru,en}.json` (`byline.author`, `byline.readingTime`)
**Acceptance:**
- [ ] Под h1 поста: 32×32 или 48×48 аватар (link на `/about`) + имя автора (link на `/about`) + дата + reading time.
- [ ] Reading time берётся из существующего расчёта (Phase 4 reading-time).
- [ ] Стилистика — тонкая полоска, не перекрывает h1.
- [ ] AuthorCard внизу статьи остаётся без изменений (это глубокая bio-карточка).
**Depends on:** SEO-8

### SEO-13: Author-card на главной
**Priority:** P1
**Effort:** M
**Owner:** frontender + content-author
**Files:**
- `src/pages/index.astro` (новая секция между hero и course-card)
- `src/i18n/strings.{ru,en}.json` (`home.author.bio`, `home.author.cta`)
- использует `src/lib/seo/person.ts` (для `sameAs`, `jobTitle`, `image`)
**Acceptance:**
- [ ] На главной видна карточка: фото 64×64 (link на `/about`), имя, jobTitle, 1-строка bio (≤120 символов), 3–5 социальных иконок из `Person.sameAs`.
- [ ] Все строки переведены RU + EN.
- [ ] Карточка не доминирует над hero — компактная, ниже сгиба.
**Depends on:** SEO-8

### SEO-14: BreadcrumbList JSON-LD + видимые breadcrumbs на landing pages
**Priority:** P1
**Effort:** M
**Owner:** frontender + backender
**Files:**
- `src/components/Breadcrumbs.astro` (новый, рендерит `<nav aria-label>`)
- `src/lib/seo/nodes-page.ts` (фабрика `buildBreadcrumbNode(items, locale)` — переиспользовать существующую если есть)
- `src/pages/blog/index.astro`, `src/pages/courses/[course]/index.astro`, `src/pages/courses/[course]/[lesson].astro`, `src/pages/tags/[tag].astro`, `src/pages/about.astro` и т.д.
- `src/i18n/strings.{ru,en}.json` (`breadcrumbs.home`, `breadcrumbs.blog`, `breadcrumbs.courses`, `breadcrumbs.tags`)
**Acceptance:**
- [ ] Видимые breadcrumbs на: `/blog`, `/blog/<slug>` (уже есть JSON-LD, добавить визуальные), `/courses/claude-code-guide/...`, `/tags/<tag>`, `/about`, `/now`, `/uses`, `/projects`.
- [ ] BreadcrumbList JSON-LD соответствует видимой навигации, проходит Rich Results Test.
- [ ] На главной breadcrumbs отсутствуют (как и должно).
**Depends on:** —
**Notes:** Аудит #8 PARTIAL — JSON-LD на постах уже есть, нужно расширить на остальные.

### SEO-15: WebPage / CollectionPage узел в графе схемы
**Priority:** P1
**Effort:** S
**Owner:** backender
**Files:**
- `src/lib/seo/nodes-page.ts` (`buildWebPageNode` уже существует — проверить, что принимает `type ∈ "WebPage" | "CollectionPage"`)
- `src/pages/index.astro`, `src/pages/blog/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/courses/[course]/index.astro`, `src/pages/about.astro`, `src/pages/now.astro`, `src/pages/uses.astro`, `src/pages/projects.astro` — везде передавать `extraSchemaNodes={[ buildWebPageNode(...) ]}`
**Acceptance:**
- [ ] На каждой landing page в графе есть `WebPage`/`CollectionPage` узел с `@id = canonical#webpage`, `url`, `name = title`, `description`, `inLanguage`, `isPartOf` → WebSite, `primaryImageOfPage` → OG image, `breadcrumb` → BreadcrumbList (если есть).
- [ ] `/blog`, `/tags/*`, `/projects`, `/courses/claude-code-guide` — `CollectionPage`.
- [ ] `/about`, `/now`, `/uses`, `/` — `WebPage`.
**Depends on:** SEO-14 (для `breadcrumb` ссылки)

### SEO-16: dateModified на главной
**Priority:** P1
**Effort:** S
**Owner:** backender
**Files:**
- `src/lib/seo/nodes-page.ts` (`buildWebPageNode` принимает опциональный `dateModified`)
- `src/pages/index.astro` (передать `max(post.pubDate ∪ lesson.pubDate)` как `dateModified`)
**Acceptance:**
- [ ] WebPage главной имеет `dateModified` равный максимальной дате публикации.
- [ ] Значение обновляется автоматически при билде.
**Depends on:** SEO-15

### SEO-17: Organization.logo как PNG ≥112×112
**Priority:** P1
**Effort:** XS
**Owner:** content-author + backender
**Files:**
- `src/lib/seo/nodes-global.ts:46`
- `public/logo-512.png` (новый, square ≥512×512 PNG)
**Acceptance:**
- [ ] `Organization.logo` указывает на `/logo-512.png`.
- [ ] Файл существует, square, raster.
- [ ] Google Rich Results Test для главной не выдаёт warning по logo.
**Depends on:** —
**Notes:** Critic-finding EXT-5.

### SEO-18: BlogPosting.articleBody — пометить как abstract или отдавать целиком
**Priority:** P1
**Effort:** S
**Owner:** backender
**Files:**
- `src/layouts/PostLayout.astro:59` (источник 800-char excerpt)
- `src/lib/seo/nodes-page.ts:19` (`buildBlogPostingNode`)
**Acceptance:**
- [ ] Принято решение: либо `articleBody` отдаёт целое тело поста, либо переименовано в `abstract` (Schema.org-совместимое поле для summary).
- [ ] Если abstract — `articleBody` либо удалён, либо отдаёт реальный body (без обрезки).
- [ ] Google Rich Results Test для одного поста не выдаёт mismatch warning.
**Depends on:** —
**Notes:** Critic-finding EXT-6. Текущий 800-char excerpt — потенциальный спам-сигнал для краулера.

---

## Phase 3 — P2 / Internal linking & schema graph

### SEO-19: Тег-хабы и ссылки на `/tags/<tag>`
**Priority:** P2
**Effort:** M
**Owner:** frontender + backender
**Files:**
- `src/pages/tags/[tag].astro`, `src/pages/tags/index.astro` (если ещё нет)
- `src/pages/index.astro` (новый блок "Темы" / "Topics" с топ-5 тегов)
- `src/components/PostMeta.astro` или `PostLayout.astro` (теги поста как ссылки)
- `src/lib/content/loader.ts` (helper `getTopTags({ locale, limit })`)
**Acceptance:**
- [ ] `/tags/<tag>` — рабочий список постов по тегу с CollectionPage JSON-LD.
- [ ] На главной видна секция "Темы" / "Topics" — топ-5 кликабельных тегов.
- [ ] На каждом посте теги отрендерены как `<a href="/tags/<tag>">`.
- [ ] Sitemap обновляется (см. SEO-2).
**Depends on:** SEO-2

### SEO-20: Содержательный footer
**Priority:** P2
**Effort:** S
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:184-189`
- `src/i18n/strings.{ru,en}.json` (`footer.section.about`, `footer.section.read`, `footer.section.connect`)
**Acceptance:**
- [ ] Footer содержит 3 колонки: About (`/about`, `/now`, `/uses`, `/projects`), Read (`/blog`, `/courses/claude-code-guide`, `/tags`, RSS, JSON Feed), Connect (`Person.sameAs` + email).
- [ ] Внутренние ссылки без `rel=nofollow`; внешние (sameAs) с `rel="me noopener"`.
- [ ] Копирайт + meta-фраза остаются.
**Depends on:** SEO-8 (sameAs)

### SEO-21: Уменьшить повтор course-card на главной
**Priority:** P2
**Effort:** S
**Owner:** frontender
**Files:**
- `src/pages/index.astro:32-39`
- `src/components/SiteSidebar.astro:51-72`
**Acceptance:**
- [ ] На главной "Claude Code Guide" упоминается ровно дважды: в course-card (с CTA) и в sidebar (как заголовок секции с уроками).
- [ ] На лендинге курса (`/courses/claude-code-guide`) course-card не дублируется.
- [ ] Anchor-text variation: ссылки на курс используют разные тексты (не все 16 = "Claude Code Guide").
**Depends on:** SEO-6

### SEO-22: Починить дубль sidebar в DOM на mobile
**Priority:** P2
**Effort:** S
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:170-176` (`<MobileDrawer>` + `.layout__sidebar`)
**Acceptance:**
- [ ] Sidebar рендерится в DOM ровно один раз, прячется через CSS на >1024px viewport.
- [ ] Либо MobileDrawer открывает копию через JS-портал, не дублируя DOM.
- [ ] Lighthouse "Crawlable structure" не показывает дубли nav-ссылок.
**Depends on:** —
**Notes:** Critic-finding EXT-1. Усугубляет SEO-21 в 2 раза.

### SEO-23: Per-page OG-images для landing pages
**Priority:** P2
**Effort:** M
**Owner:** backender
**Files:**
- `src/pages/og/index.png.ts`, `src/pages/og/blog.png.ts`, `src/pages/og/about.png.ts`, `src/pages/og/courses-claude-code-guide.png.ts` (новые endpoints)
- `src/pages/index.astro`, `src/pages/blog/index.astro`, `src/pages/about.astro`, `src/pages/courses/[course]/index.astro` (передавать `ogImage` в BaseLayout)
- альтернатива: один универсальный `src/pages/og/[...path].png.ts` с template'ом по pathname
**Acceptance:**
- [ ] При шаринге `/`, `/blog`, `/about`, `/courses/claude-code-guide` в Twitter/Telegram/Slack — OG показывает per-page изображение с заголовком страницы (а не generic `og-default.png`).
- [ ] Twitter Card validator проходит для каждой landing page.
**Depends on:** —
**Notes:** Critic-finding EXT-2.

### SEO-24: og:locale:alternate
**Priority:** P2
**Effort:** XS
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:118` (рядом с `og:locale`)
**Acceptance:**
- [ ] На RU-страницах: `<meta property="og:locale:alternate" content="en_US">` если EN-зеркало существует.
- [ ] На EN-страницах: `<meta property="og:locale:alternate" content="ru_RU">` если RU-источник существует.
- [ ] Не выводить alternate, если counterpart не существует.
**Depends on:** —

### SEO-25: JSON Feed (`/feed.json`)
**Priority:** P2
**Effort:** M
**Owner:** backender
**Files:**
- `src/pages/feed.json.ts` (новый, аналог `rss.xml.ts`)
- `src/pages/en/feed.json.ts`
- `src/layouts/BaseLayout.astro` (новый `<link rel="alternate" type="application/feed+json">`)
**Acceptance:**
- [ ] `/feed.json` валиден по [JSON Feed 1.1 spec](https://jsonfeed.org/version/1.1).
- [ ] EN-версия на `/en/feed.json`.
- [ ] В head обеих локалей рендерится `<link rel="alternate" type="application/feed+json">` рядом с RSS.
- [ ] Sitemap включает feed-URLs.
**Depends on:** SEO-11 (использовать те же helpers формирования feed-items)

---

## Phase 4 — P3 / Performance & polish

### SEO-26: Preconnect к Plausible
**Priority:** P3
**Effort:** XS
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro` (head, до `<Analytics>`)
**Acceptance:**
- [ ] В `<head>` стоит `<link rel="preconnect" href="https://plausible.io" crossorigin>` (или хост из SEO-3).
- [ ] Lighthouse Performance "Preconnect to required origins" — pass.
**Depends on:** SEO-3

### SEO-27: Отложить inline-fetch /api/auth/get-session
**Priority:** P3
**Effort:** S
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:277-289`
**Acceptance:**
- [ ] Fetch обёрнут в `requestIdleCallback(...)` с `setTimeout(fn, 0)` фолбэком для Safari.
- [ ] Lighthouse FCP / TTI не ухудшаются (replay до/после).
- [ ] `body[data-auth="signed-in"]` атрибут продолжает выставляться корректно.
- [ ] UI-острова, ожидающие атрибут (CertificateButton, course progress), показывают skeleton до его появления, а не моргают.
**Depends on:** —

### SEO-28: hreflang `ru-RU` / `en-US`
**Priority:** P3
**Effort:** XS
**Owner:** frontender
**Files:**
- `src/layouts/BaseLayout.astro:107-110`
**Acceptance:**
- [ ] Добавлены или заменены `hreflang="ru"` → `ru-RU`, `hreflang="en"` → `en-US` (можно оставить обе формы согласно Google guideline).
- [ ] x-default остаётся.
- [ ] Search Console "International Targeting" не показывает ошибок.
**Depends on:** —

---

## Out-of-scope / parking lot

- **Author Organization-узел.** Отдельный Organization для "редакции" — добавлять, только если блог станет multi-author.
- **AMP / Reader Mode.** Низкий ROI на 2026.
- **Course / HowTo / FAQPage schema.** После SEO-15 и анализа CTR в Search Console (3+ месяца данных).
- **Internal-anchor-text variation tooling.** Скрипт-проверка повторов якорей. Полезно после SEO-21/22.
- **Pagefind / Postgres FTS.** Уже отдельный план (memory: plan-3-search).

---

## Suggested first sprint (this week)

7 задач, дающих максимум CTR-выигрыша при минимальном риске. Все P0 + 1 P1.

| Order | Task | Effort | Why first |
|-------|------|--------|-----------|
| 1 | SEO-1 (даты постов) | XS | Решить контент-вопрос до SEO-16 |
| 2 | SEO-4 (title-шаблоны) | S | Главный CTR-плечо |
| 3 | SEO-5 (description главной) | XS | Удваивает SERP-площадь |
| 4 | SEO-6 (h2 + aria-label) | S | A11y + семантика |
| 5 | SEO-7 (убрать SVG из og:image:secure_url) | XS | Чистота OG |
| 6 | SEO-8 (sameAs + аватар) | S | Разблокирует SEO-12, 13, 20 |
| 7 | SEO-10 (дубль Person.subjectOf) | XS | Чистота knowledge graph |

Итого ≈ 4–5 часов работы. Эффект на CTR измеряется в Search Console через 2–3 недели после деплоя.

## Sequencing diagram

```
SEO-1                                             ─→ (closes)
SEO-2 ─→ SEO-19
SEO-3 ─→ SEO-26
SEO-4, SEO-5, SEO-7, SEO-9, SEO-10, SEO-11, SEO-17, SEO-18, SEO-22, SEO-24, SEO-27, SEO-28  ─→ независимые
SEO-6 ─→ SEO-21
SEO-8 ─→ SEO-12, SEO-13, SEO-20
SEO-14 ─→ SEO-15 ─→ SEO-16
SEO-11 ─→ SEO-25
SEO-23  ─→ независимая
```
