---
title: "Mermaid → SVG через Playwright на билд-тайме: холодный старт, кэш и стоимость SSG"
description: "Замеры реального Astro-блога с 32 Mermaid-диаграммами: холодный билд 11.6s, тёплый 6.3s. Где кэш, что делает Playwright, чем плохи альтернативы."
summary: "Mermaid плох как client-side opex (большой JS, FOUC, hydration cost), но хорош как build-time SVG, если готовы заплатить ~5 секунд за cold-start Playwright. Реальные цифры с этого блога: 32 диаграммы, 11.6s холодный билд, 6.3s тёплый."
keywords: ["Mermaid", "Playwright", "SSG", "Astro", "build-time", "rehype-mermaid", "img-svg"]
faq:
  - question: "Почему билд-тайм рендер Mermaid лучше client-side?"
    answer: "Client-side Mermaid тащит ~700 KB JS (mermaid.min.js + dagre + d3), блокирует TTI и даёт FOUC, потому что диаграмма появляется только после hydration. Build-time SVG — это статика: ноль JS на клиенте, корректный SEO/OG-snapshot, никакого мерцания. Платите вы только разовым cold-start Playwright во время билда (~5 секунд на этом блоге)."
  - question: "Где rehype-mermaid хранит кэш SVG?"
    answer: "Никакого специального .cache/mermaid/ rehype-mermaid не создаёт: пакет mermaid-isomorphic запускает Chromium через Playwright и рендерит каждый блок заново. Эффект «тёплого билда» (6.3s vs 11.6s на этом сайте) даёт Astro: распарсенный MDX и data-store лежат в .astro/ и node_modules/.astro/ (~5 MB), плюс Vite-кэш транспилированных модулей. Инвалидация — по mtime исходников."
  - question: "Сколько весит Playwright на CI?"
    answer: "Сам пакет playwright-core — 11 MB, но критичен Chromium-бандл: на macOS у нас в ~/Library/Caches/ms-playwright лежит 528 MB (chromium-1217 + chromium_headless_shell-1217 + ffmpeg). На Linux это столько же, плюс system-deps (libnss3, libatk-1.0, libgbm) — Docker-слой раздувается на 200-400 MB сверху. Митигации: pnpm playwright install chromium --with-deps только на CI-step с билдом, не в рантайм-образе."
  - question: "Чем mermaid-cli хуже rehype-mermaid?"
    answer: "mermaid-cli (@mermaid-js/mermaid-cli) — это тонкая обёртка над puppeteer, которая каждый запуск спавнит свой Chromium. У него нет интеграции с rehype/markdown-pipeline: вам надо вручную extract'ить блоки из markdown, рендерить, вставлять обратно. На 32 диаграммы это 32 отдельных запуска Chromium вместо одного, что добавляет десятки секунд. rehype-mermaid через mermaid-isomorphic держит один browser-context на весь билд."
  - question: "Когда стоит выбрать client-side mermaid вместо билд-тайма?"
    answer: "Три случая. Первый — пользователь редактирует диаграмму в рантайме (например, документация-as-code с live preview). Второй — диаграммы генерируются динамически из БД на каждый запрос (тогда ни кэш, ни билд не помогут). Третий — у вас Vercel/Netlify free tier с лимитом на build minutes, и +10 секунд за билд критичнее, чем +700 KB JS у пользователя. Во всех остальных кейсах билд-тайм выигрывает."
pubDate: 2026-04-30
tags: ["build-tooling", "astro"]
cover: "/og-default.svg"
coverAlt: "сравнительный график холодного и тёплого билда с Playwright"
lang: "ru"
draft: false
---

> Mermaid-диаграммы в блоге — это либо большой клиентский JS-бандл с FOUC и hydration cost, либо билд-тайм SVG за разовый cold-start Playwright. На этом сайте `rehype-mermaid` рендерит 32 диаграммы за **11.6 секунды** при холодном кэше и **6.3 секунды** при тёплом. Ниже — конкретные цифры, архитектура, ловушки CI и факт-чек альтернатив.

---

## 1. Зачем рендерить Mermaid build-time, а не client-side

Mermaid (`mermaid` на npm, репозиторий `mermaid-js/mermaid`) — JS-библиотека, которая принимает текстовый DSL (`flowchart TD`, `sequenceDiagram`, `gantt`, ...) и эмитит SVG. По умолчанию её используют так: подключают `<script src="mermaid.min.js">`, дёргают `mermaid.run()` после `DOMContentLoaded`, и каждый `<pre class="mermaid">` подменяется на SVG в DOM прямо в браузере.

Это работает, но платит за это пользователь:

| Метрика                             | Client-side Mermaid                       | Build-time SVG                               |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Бандл JS (gzipped)                  | ~250–300 KB (mermaid + d3 + dagre)        | 0 KB                                         |
| Time to Interactive (TTI)           | задержка на parse + execute               | без изменений                                |
| FOUC                                | да: сначала текст, потом SVG              | нет: SVG в HTML с первого байта              |
| SEO / Open Graph                    | поисковику виден только текст-DSL         | поисковик видит SVG как часть страницы       |
| Печать страницы                     | пустые блоки если JS отключён             | корректный рендер                            |
| Тёмная тема без вспышки             | сложно: тема загружается после гидратации | работает: SVG генерируется уже в нужной теме |
| Стоимость билда                     | 0 (только bundle js)                      | +5–10 секунд cold-start Playwright           |
| Стоимость рантайма для пользователя | высокая (CPU + сеть)                      | нулевая                                      |

`rehype-mermaid` (`remcohaszing/rehype-mermaid`, v3.0.0) — rehype-плагин, который во время билда обходит HAST-дерево, находит узлы `<code class="language-mermaid">`, рендерит их через `mermaid-isomorphic` (`mermaid-isomorphic@3.1.0`), и заменяет на готовый SVG. Под капотом — Playwright + headless Chromium.

Stratёgy `img-svg`, который мы используем, эмитит результат как `<img src="data:image/svg+xml,...">`. Альтернатива — `inline-svg` (вставить SVG прямо в HTML) или `pre-mermaid` (оставить как есть для client-side рендера).

---

## 2. Архитектура: rehype-mermaid + Playwright

````mermaid
flowchart LR
  md["Markdown<br/>с ```mermaid блоками"]
  mdx["@astrojs/mdx<br/>(remark + rehype)"]
  rh["rehype-mermaid<br/>(плагин)"]
  iso["mermaid-isomorphic"]
  pw["Playwright<br/>(Chromium)"]
  svg["SVG как data URI<br/>в HTML"]

  md --> mdx
  mdx --> rh
  rh -->|для каждого блока| iso
  iso -->|launch headless| pw
  pw -->|"mermaid.render() в DOM"| iso
  iso -->|serialised SVG| rh
  rh --> svg
````

Конкретный конфиг — `astro.config.ts`:

```ts
import rehypeMermaid from "rehype-mermaid";
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  integrations: [
    mdx({
      rehypePlugins: [[rehypeMermaid, { strategy: "img-svg", dark: true }]],
    }),
  ],
  markdown: {
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid", "math"],
    },
    rehypePlugins: [[rehypeMermaid, { strategy: "img-svg", dark: true }]],
  },
});
```

Важные мелочи:

- `excludeLangs: ["mermaid"]` в shiki-конфиге — иначе Shiki сначала превратит блок в `<pre class="shiki">` и rehype-mermaid его уже не увидит.
- Плагин подключается дважды: и в `markdown.rehypePlugins`, и в `mdx.rehypePlugins`. Astro 5 не наследует один из другого автоматически — это типичный источник «у меня в `.md` рендерится, а в `.mdx` нет».
- `dark: true` генерирует две версии SVG (для светлой и тёмной темы) и через `<picture><source>` подставляет нужную по `prefers-color-scheme`. Это удваивает размер data-uri-блоков, но даёт правильный контраст без JS.

---

## 3. Холодный старт vs тёплый билд

Метрика — `time pnpm build` (Apple M-серия, локально, тёплый Chromium-бинарь в `~/Library/Caches/ms-playwright`). Команда полного сноса кэшей:

```bash
rm -rf .astro node_modules/.astro dist
time pnpm build
```

Три прогона на холодную, три на тёплую (медиана):

| Тип                                                 | Прогон 1 | Прогон 2 | Прогон 3 | **Медиана** |
| --------------------------------------------------- | -------- | -------- | -------- | ----------- |
| Холодный (`rm -rf .astro node_modules/.astro dist`) | 11.580s  | 11.860s  | 11.486s  | **11.580s** |
| Тёплый (без сноса)                                  | 6.250s   | 6.305s   | —        | **~6.28s**  |

Из 11.6 секунд холодного билда:

- ~5–6 секунд — реально SSG-стадия (Astro обходит роуты, рендерит 45 HTML-страниц на 14 RU-постов + 13 EN-twin'ов + индекс, теги, RSS, sitemap).
- ~5 секунд — overhead Playwright: запуск Chromium, инициализация mermaid-bundle в DOM, прогрев JIT.
- ~0.2 секунды — `pagefind --site dist/client` (поисковый индекс).

На тёплом билде Playwright всё равно стартует заново (никакого долгоживущего process pool у `mermaid-isomorphic` нет), но:

- `.astro/data-store.json` (5.2 MB) уже содержит распарсенный MDX content layer — Astro не парсит markdown повторно для тех файлов, у которых не изменился mtime.
- `node_modules/.astro/` (5.1 MB) — Vite-кэш транспилированных модулей.
- Сам Playwright Chromium бинарь уже в `/Library/Caches/ms-playwright/chromium-1217/` (528 MB суммарно с headless-shell и ffmpeg) — на cold disk-cache его пришлось бы ещё прочитать, что добавляет ~1–2 секунды на медленных дисках.

Ключевой факт: **сам `mermaid-isomorphic` НЕ кэширует SVG между билдами**. Я искал в его исходниках (`node_modules/.pnpm/mermaid-isomorphic@3.1.0_playwright@1.59.1/.../mermaid-isomorphic.js`) — там нет ни `persistDir`, ни file-based cache. Каждый build диаграммы рендерятся с нуля. «Тёплость» — это кэш Astro/Vite, а не плагина.

> CI-замер для GitHub Actions `ubuntu-latest` `(owner to fill: запустить workflow_dispatch на чистом раннере, замерить median из 3 прогонов с `actions/cache@v4` для node_modules + .astro)`.

---

## 4. Стоимость на CI

Playwright тащит Chromium (~528 MB на macOS у меня в кэше, аналогичный порядок на Linux), плюс на Debian/Ubuntu нужны system-deps: `libnss3`, `libatk-1.0-0`, `libcups2`, `libgbm1`, `libxkbcommon0`, `libpango-1.0-0`, `libasound2`, fontconfig + хотя бы один шрифт.

**Митигации:**

1. **Не ставить Chromium в production-image.** Если вы строите Astro-сайт SSG-only и деплоите статику — Playwright нужен ТОЛЬКО на CI-step с билдом, не в рантайм-Docker'е. Используйте multi-stage:

```bash
# build-stage:
FROM node:24-bookworm AS build
RUN pnpm install
RUN pnpm exec playwright install --with-deps chromium
RUN pnpm build

# run-stage:
FROM node:24-bookworm-slim AS run
COPY --from=build /app/dist ./dist
# никакого playwright тут
```

2. **GitHub Actions caching.** `actions/cache@v4` ключ: `${{ hashFiles('pnpm-lock.yaml') }}-playwright`, путь: `~/.cache/ms-playwright`. Спасает от повторной выкачки Chromium (~150 MB сетью) на каждом push.

3. **Использовать system Chrome вместо Playwright Chromium.** Установить `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` и при создании браузера передавать `executablePath: '/usr/bin/google-chrome-stable'`. Но: `mermaid-isomorphic` не пробрасывает `launchOptions` через rehype-mermaid api — придётся форкать или жить с дефолтным Chromium.

4. **Если 5 секунд cold-start критичны** — гонять Playwright вне билда: pre-render все диаграммы в отдельном CI-step, коммитить SVG в репо, в основном билде использовать стратегию pre-mermaid с подменой на готовые ассеты. Сложнее, но снимает Playwright с горячего пути.

---

## 5. Кэширование SVG: где они и что инвалидирует

Опубличный замер на dev-машине (45 скомпилированных HTML, 27 страниц с диаграммами, 61 data-uri суммарно — 32 RU + 29 EN, потому что одна EN-страница рендерится без диаграммы из-за специфики поста):

| Метрика                                              | Значение         |
| ---------------------------------------------------- | ---------------- |
| Mermaid-блоков в `*.md`                              | 32 (в 14 постах) |
| Скомпилированных HTML                                | 45               |
| Страниц с встроенной диаграммой                      | 27               |
| Data-URI блоков `<img src="data:image/svg+xml,...">` | 61               |
| Минимум, байт                                        | 15 551           |
| Медиана, байт                                        | 25 301           |
| Среднее, байт                                        | 26 579           |
| Максимум, байт                                       | 45 711           |
| Размер `.astro/`                                     | 5.0 MB           |
| Размер `node_modules/.astro/`                        | 5.1 MB           |
| Размер `dist/`                                       | 17 MB            |
| Размер Chromium-кэша Playwright                      | 528 MB           |

Где живёт что:

- **SVG не лежат на диске как отдельные файлы.** Стратегия `img-svg` инлайнит их прямо в HTML как `data:image/svg+xml,...` (URL-encoded). Это видно в `dist/client/blog/02-context-and-cache/index.html`: 4 диаграммы → 4 data-uri в одном HTML.
- **Astro content-layer кэш** — `.astro/data-store.json` (5.2 MB после билда). Это распарсенный markdown с уже применёнными remark/rehype-плагинами — но **до** rehype-mermaid: проверка показывает, что инвалидация по mtime исходника гонит rehype-mermaid повторно даже для файлов, по которым ничего не поменялось.
- **Vite-кэш** — `node_modules/.astro/` (5.1 MB). Транспилированные TS/JSX модули, не имеет отношения к mermaid-рендеру.
- **mermaid-isomorphic собственного кэша не имеет.** Это ключевая ловушка: если вы поменяли запятую в одном `*.md` — rehype-mermaid пересоберёт ВСЕ диаграммы этого файла. Нет content-addressable кэша «hash diagram source → SVG».

Если кэш rehype-mermaid вам критичен — обходной путь: написать тонкий rehype-плагин-обёртку, который хеширует исходник диаграммы (sha256 от текста между ` ```mermaid` и ` ``` `), смотрит в `.cache/mermaid/<hash>.svg` — и при попадании отдаёт его без вызова `mermaid-isomorphic`. На этом блоге пока не делал — 11.6 секунд cold-start не настолько больно.

---

## 6. Альтернативы: что я смотрел и почему не выбрал

### 6.1. `@mermaid-js/mermaid-cli`

Официальный CLI от mermaid-js: `mmdc -i diagram.mmd -o diagram.svg`. Под капотом — puppeteer (форк Chromium API) + полный Chromium-бинарь.

Минусы для блог-пайплайна:

- Нет интеграции с rehype/remark — markdown-блоки придётся extract'ить руками.
- Каждый запуск — новый browser context (нет batch-режима).
- На 32 диаграммы — 32 отдельных запуска puppeteer ≈ десятки секунд против ~5–6 секунд у `mermaid-isomorphic` с одним browser-instance.

Когда подойдёт: разовая конвертация `*.mmd → *.svg` в монорепо для дизайнеров, не для динамической вставки в HTML.

### 6.2. Client-side `mermaid` (npm-пакет)

Минусы выше уже разобраны: бандл, FOUC, hydration. Один плюс — динамические диаграммы из user input в рантайме (live preview в редакторе документации). Для статики блога — overkill.

### 6.3. `mermaid-isomorphic` напрямую (без rehype)

Тот же пакет, который дёргает rehype-mermaid под капотом. Можно использовать вне Astro: `import { createMermaidRenderer } from 'mermaid-isomorphic'; const renderer = createMermaidRenderer(); const [{ svg }] = await renderer([{ value: 'flowchart TD\nA-->B' }]);`.

Когда подойдёт: своя пайплайн-сборка (Eleventy, MkDocs-плагин на Node.js), не использующая rehype-цепочку. У меня — Astro, поэтому rehype-mermaid даёт zero-boilerplate.

### 6.4. Pre-render через GitHub Actions matrix + commit обратно

Гипотетически: workflow на push, который рендерит SVG, коммитит в `public/diagrams/`, и в build-step используется стратегия `pre-mermaid` с заменой на `<img src="/diagrams/<hash>.svg">`. Снимает Playwright с горячего пути билда, но: усложняет PR-review (бинарные файлы в diff), требует отдельного workflow, ломает локальный dev `pnpm dev` если SVG ещё не закоммичен.

Не делал — 5 секунд cold-start экономии не оправдывают.

### Сводная таблица

| Вариант                                 | Cold-start                   | Кэш SVG        | Bundle JS | Сложность setup   |
| --------------------------------------- | ---------------------------- | -------------- | --------- | ----------------- |
| `rehype-mermaid` + Playwright (текущий) | ~5–6s                        | нет            | 0         | низкая (1 plugin) |
| `mermaid-cli` (`mmdc`)                  | ~10s+                        | нет            | 0         | средняя           |
| Client-side `mermaid`                   | 0                            | браузерный кэш | ~250 KB   | низкая            |
| Pre-render + commit                     | 0 в билде, но ~5s в pre-step | да, в git      | 0         | высокая           |

---

## 7. Чек-лист «что замерить, прежде чем выбирать»

Прежде чем коммититься к билд-тайм-рендеру или к чему-то другому:

1. **Сколько диаграмм в среднем.** На 1–3 — client-side OK (ленивая загрузка mermaid через dynamic import). На 30+ — build-time дешевле для пользователя.
2. **Частота правок.** Если правите контент по 5 раз в день — cold-start 11 секунд × 50 пушей = ~10 минут CI-времени в день. Если раз в неделю — наплевать.
3. **CI-платформа.** Vercel hobby, Netlify free, Cloudflare Pages — у всех лимиты на build minutes. Playwright + Chromium на каждой PR-preview = быстро упрётесь. На self-hosted runner или Dokploy (как у меня) — без разницы.
4. **Целевой размер JS-бандла.** Если у проекта KPI «<100 KB initial JS» — 250 KB mermaid client-side нарушит бюджет. Build-time SVG не трогает JS-бюджет.
5. **Нужен ли интерактив.** Pan/zoom/click-handlers в диаграмме? Тогда client-side обязателен. Статичная картинка для чтения? Build-time.
6. **Где живёт ваша cold-start стоимость.** Если рантайм-Docker — вырезайте Playwright из run-stage. Если CI — кэшируйте Chromium через `actions/cache`.
7. **Готовы ли мириться с отсутствием SVG-кэша.** rehype-mermaid рендерит ВСЕ блоки файла при любой правке. Если это больно — пишите свою кэширующую обёртку с sha256-ключом по исходнику диаграммы.

---

## Итог

На этом блоге `rehype-mermaid` + Playwright стоит ~5 секунд cold-start, выдаёт 32 диаграммы в 27 HTML-страниц с медианным размером инлайн-SVG в 25 KB, не требует ни одного байта JS на клиенте, и позволяет писать диаграммы прямо в markdown. Это очень хороший трейдоф для статического блога.

Когда не подойдёт: блог с сотней диаграмм, deploy-platform с лимитом на build minutes, или требование к интерактивным диаграммам. В первом случае — пишите кэширующую обёртку, во втором — pre-render в отдельный workflow, в третьем — client-side.

Главная неочевидная вещь, которую стоит запомнить: **Astro «прогревается» (5.2 MB content-store, Vite-кэш), но `mermaid-isomorphic` — нет**. Cold-start Playwright платится при каждом билде заново. Это не баг, это by-design — и это причина, по которой мой полный билд занимает 11.6 секунд, а не 1.6.
