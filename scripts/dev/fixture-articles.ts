import type { ArticleDocument } from "../../src/lib/content-api/contract";

/**
 * Content of tests/fixtures/content-snapshot.json. Slugs are the real ones, so internal links and
 * the tests that name a slug keep working; every title says it is a fixture. The shape of each
 * article (blocks, tags, cover, hidden) is what built and e2e tests rely on: see the table in
 * docs/specs/plans/2026-10-03-api-only-migration.md and tests/unit/content/fixture-snapshot.test.ts.
 */
export type FixtureLang = "ru" | "en";
export type FixtureText = Readonly<{
  title: string;
  description: string;
  summary: string;
  keywords: readonly string[];
  body: string;
  sources: ArticleDocument["sources"];
  faq?: ArticleDocument["faq"];
}>;
export type FixtureArticle = Readonly<{
  slug: string;
  /** Calendar day of the RU publication; EN is published one hour later. */
  day: string;
  tags: readonly string[];
  relatedSlugs?: readonly string[];
  hiddenFromList?: boolean;
  /** An external cover (asset form, so the social image and its size are written too). */
  cover?: Readonly<{
    url: string;
    width: number;
    height: number;
    alt: Readonly<Record<FixtureLang, string>>;
  }>;
  seoTitle?: Readonly<Record<FixtureLang, string>>;
  texts: Readonly<Partial<Record<FixtureLang, FixtureText>>>;
}>;

const ROBOTS_DESC_RU =
  "Какие ИИ-краулеры читают сайт и как описать им правила в robots.txt без потери поисковой выдачи";
const ROBOTS_DESC_EN =
  "Which AI crawlers read a site and how to describe their rules in robots.txt without losing search traffic";
const CRAWLED_DESC_RU =
  "Почему страница получает статус crawled but not indexed и какие проверки сайта на Astro стоит сделать первыми";
const CRAWLED_DESC_EN =
  "Why a page gets the crawled but not indexed status and which checks to run first on an Astro site";

const MERMAID_FLOW = (title: string, desc: string, a: string, b: string, c: string): string =>
  [
    "```mermaid",
    "flowchart LR",
    `  accTitle: ${title}`,
    `  accDescr: ${desc}`,
    `  A[${a}] --> B[${b}]`,
    `  B --> C[${c}]`,
    "```",
  ].join("\n");

export const FIXTURE_ARTICLES: readonly FixtureArticle[] = [
  {
    slug: "claude-code-video-guide",
    day: "2026-05-03",
    tags: ["claude-code", "guide"],
    texts: {
      ru: {
        title: "Видеогид по Claude Code для новичков (фикстура)",
        description:
          "Как за один вечер собрать рабочий процесс с Claude Code: установка, команды, проверки.",
        summary:
          "Короткий учебный маршрут по Claude Code: установка, первая сессия, запуск проверок и разбор результата. Текст служит тестовой фикстурой сборки.",
        keywords: ["Claude Code", "видеогид"],
        body: [
          "Этот текст нужен сборке сайта, а не читателю: он проверяет вывод блоков кода и ссылок.",
          "## Установка",
          "Поставьте инструмент и проверьте версию.",
          "```bash\nnpm install -g @anthropic-ai/claude-code\nclaude --version\n```",
          "## Первая сессия",
          "Опишите задачу одной фразой и попросите сначала составить план.",
          "```ts\nexport const plan = (task: string): string[] => [`read ${task}`, `change ${task}`];\n```",
        ].join("\n\n"),
        sources: [
          {
            url: "https://docs.anthropic.com/en/docs/claude-code/overview",
            title: "Claude Code overview",
          },
        ],
      },
      en: {
        title: "A video guide to Claude Code for beginners (fixture)",
        description:
          "How to build a working Claude Code routine in one evening: install, commands, checks.",
        summary:
          "A short learning path for Claude Code: install, the first session, running checks and reading the result. The text is a build test fixture.",
        keywords: ["Claude Code", "video guide"],
        body: [
          "This text is for the site build, not for a reader: it checks how code blocks and links are rendered.",
          "## Install",
          "Install the tool and check the version.",
          "```bash\nnpm install -g @anthropic-ai/claude-code\nclaude --version\n```",
          "## The first session",
          "Describe the task in one sentence and ask for a plan first.",
          "```ts\nexport const plan = (task: string): string[] => [`read ${task}`, `change ${task}`];\n```",
        ].join("\n\n"),
        sources: [
          {
            url: "https://docs.anthropic.com/en/docs/claude-code/overview",
            title: "Claude Code overview",
          },
        ],
      },
    },
  },
  {
    slug: "claude-md-12-rules",
    day: "2026-05-10",
    tags: ["ai", "claude-code", "prompt-engineering"],
    texts: {
      ru: {
        title: "Двенадцать правил для CLAUDE.md (фикстура)",
        description:
          "Как проверять каждое правило в CLAUDE.md по следу, который оно оставляет в задаче.",
        summary:
          "Фикстура сборки: статья с оглавлением, первым блоком кода с пустой строкой и диаграммой Mermaid, у которой есть заголовок и описание.",
        keywords: ["CLAUDE.md", "правила для агента"],
        body: [
          "Файл CLAUDE.md работает, пока каждое правило можно проверить после задачи.",
          "## Откуда берутся правила",
          "Правило появляется из замеченной ошибки, а не из желания описать идеал.",
          '```ts\nconst rules = loadRules("CLAUDE.md");\n\nexport const check = (diff: string): boolean => rules.every((rule) => rule.test(diff));\n```',
          "## Цикл проверки",
          MERMAID_FLOW(
            "Цикл правила в CLAUDE.md",
            "Замеченная ошибка становится правилом, правило применяется к задаче, результат проверяется по диффу и тестам.",
            "Ошибка",
            "Правило",
            "Дифф и проверки",
          ),
          "## Что оставить",
          "Оставьте правила, которые меняют поведение агента и видны в диффе.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://docs.anthropic.com/en/docs/claude-code/memory",
            title: "Claude Code memory",
          },
        ],
      },
      en: {
        title: "Twelve rules for CLAUDE.md (fixture)",
        description: "How to check every rule in CLAUDE.md by the trace it leaves in a task.",
        summary:
          "A build fixture: an article with a table of contents, a first code block with an empty line and a Mermaid diagram that has a title and a description.",
        keywords: ["CLAUDE.md", "agent rules"],
        body: [
          "A CLAUDE.md file works while every rule can be checked after a task.",
          "## Where the rules come from",
          "A rule comes from an observed failure, not from a wish to describe an ideal.",
          '```ts\nconst rules = loadRules("CLAUDE.md");\n\nexport const check = (diff: string): boolean => rules.every((rule) => rule.test(diff));\n```',
          "## The checking loop",
          MERMAID_FLOW(
            "The rule loop in CLAUDE.md",
            "An observed failure becomes a rule, the rule is applied to a task, and the result is checked through the diff and the tests.",
            "Failure",
            "Rule",
            "Diff and checks",
          ),
          "## What to keep",
          "Keep the rules that change the agent behavior and show up in the diff.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://docs.anthropic.com/en/docs/claude-code/memory",
            title: "Claude Code memory",
          },
        ],
      },
    },
  },
  {
    slug: "crawled-not-indexed-astro-audit",
    day: "2026-06-01",
    tags: ["seo", "astro"],
    texts: {
      ru: {
        title: "Страница просканирована, но не в индексе: аудит сайта на Astro (фикстура)",
        description: CRAWLED_DESC_RU,
        summary:
          "Фикстура сборки: тело начинается с цитаты, повторяющей описание, и содержит блочную и строчную формулы. Так видно, что рендер получил заголовок документа.",
        keywords: ["не в индексе", "аудит Astro"],
        body: [
          `> ${CRAWLED_DESC_RU}`,
          "Поисковик видит страницу, но не считает её достаточно полезной для индекса.",
          "## Простая модель",
          "Пусть доля полезных страниц равна $p$, тогда ожидаемый охват зависит от неё линейно.",
          "$$\nE = p \\cdot N\n$$",
          "## Что проверить",
          "Проверьте канонические адреса, дубли заголовков и внутренние ссылки.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://developers.google.com/search/docs/crawling-indexing",
            title: "Crawling and indexing",
          },
        ],
      },
      en: {
        title: "Crawled but not indexed: an audit of an Astro site (fixture)",
        description: CRAWLED_DESC_EN,
        summary:
          "A build fixture: the body starts with a quote that repeats the description and has a block and an inline formula. It shows that the renderer received the document header.",
        keywords: ["not indexed", "Astro audit"],
        body: [
          `> ${CRAWLED_DESC_EN}`,
          "A search engine sees the page but does not consider it useful enough for the index.",
          "## A simple model",
          "Let the share of useful pages be $p$, then the expected coverage depends on it linearly.",
          "$$\nE = p \\cdot N\n$$",
          "## What to check",
          "Check canonical addresses, duplicate titles and internal links.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://developers.google.com/search/docs/crawling-indexing",
            title: "Crawling and indexing",
          },
        ],
      },
    },
  },
  {
    slug: "custom-domain-email-mailu-dokploy",
    // Earlier than the newest posts: the first cards of the home page must not depend on a
    // third-party image host.
    day: "2026-08-01",
    tags: ["seo", "build-tooling"],
    cover: {
      url: "https://media.tgapps.cloud/articles/ccfa00aae02c7991826287e1a4f450740f9a342f013ec7e88f33577318537cfb.webp",
      width: 1729,
      height: 910,
      alt: {
        ru: "Иллюстрация тушью: ноутбук, почтовый сервер, служба доставки и отдельный ключ учётной записи.",
        en: "Ink illustration: a laptop, a mail server, a delivery service and a separate account key.",
      },
    },
    seoTitle: {
      ru: "Почта на своём домене через Mailu и Dokploy (фикстура)",
      en: "Custom domain email with Mailu and Dokploy (fixture)",
    },
    texts: {
      ru: {
        title: "Почта на своём домене без Google Workspace (фикстура)",
        description:
          "Фикстура сборки: статья с внешней обложкой, у которой известен размер, и отдельным SEO-заголовком.",
        summary:
          "Тестовая статья с внешней обложкой: обложка совпадает с социальным изображением, а её размер записан в заголовке документа.",
        keywords: ["почта на домене", "Mailu"],
        body: [
          "Текст служит фикстурой сборки.",
          "## Схема",
          "Почтовый сервер работает на своём VPS.",
        ].join("\n\n"),
        sources: [{ url: "https://mailu.io/master/", title: "Mailu documentation" }],
      },
      en: {
        title: "Custom domain email without Google Workspace (fixture)",
        description:
          "A build fixture: an article with an external cover of a known size and a separate SEO title.",
        summary:
          "A test article with an external cover: the cover is the same as the social image and its size is recorded in the document header.",
        keywords: ["custom domain email", "Mailu"],
        body: [
          "The text is a build fixture.",
          "## The scheme",
          "The mail server runs on your own VPS.",
        ].join("\n\n"),
        sources: [{ url: "https://mailu.io/master/", title: "Mailu documentation" }],
      },
    },
  },
  {
    slug: "json-ld-graph-astro",
    day: "2026-06-15",
    tags: ["seo", "astro", "schema-org"],
    texts: {
      ru: {
        title: "Граф JSON-LD на сайте Astro (фикстура)",
        description:
          "Как связать узлы Person, Article и BreadcrumbList одним графом с общими идентификаторами.",
        summary:
          "Фикстура сборки: блок кода json и два вопроса в блоке FAQ. Проверяет, что разметка собирается из данных документа.",
        keywords: ["JSON-LD", "schema.org"],
        body: [
          "Один граф лучше трёх разрозненных блоков: узлы ссылаются друг на друга по идентификатору.",
          "## Пример",
          '```json\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "Fixture"\n}\n```',
          "## Проверка",
          "Откройте страницу в валидаторе и убедитесь, что ссылки на узлы разрешаются.",
        ].join("\n\n"),
        sources: [{ url: "https://schema.org/Article", title: "schema.org Article" }],
        faq: [
          {
            question: "Зачем связывать узлы JSON-LD?",
            answer:
              "Связанный граф показывает поисковой системе, что автор, статья и хлебные крошки относятся к одной странице.",
          },
          {
            question: "Нужен ли один блок на страницу?",
            answer:
              "Удобнее один блок с общим графом: так проще проверять идентификаторы и не дублировать узлы.",
          },
        ],
      },
      en: {
        title: "A JSON-LD graph on an Astro site (fixture)",
        description:
          "How to join Person, Article and BreadcrumbList nodes into one graph with shared identifiers.",
        summary:
          "A build fixture: a json code block and two questions in the FAQ block. It checks that the markup is built from the document data.",
        keywords: ["JSON-LD", "schema.org"],
        body: [
          "One graph is better than three separate blocks: nodes refer to each other by identifier.",
          "## Example",
          '```json\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "Fixture"\n}\n```',
          "## Validation",
          "Open the page in a validator and make sure the node references resolve.",
        ].join("\n\n"),
        sources: [{ url: "https://schema.org/Article", title: "schema.org Article" }],
        faq: [
          {
            question: "Why link JSON-LD nodes together?",
            answer:
              "A linked graph shows a search engine that the author, the article and the breadcrumbs belong to one page.",
          },
          {
            question: "Should a page have one block?",
            answer:
              "One block with a shared graph is easier to validate and does not duplicate nodes.",
          },
        ],
      },
    },
  },
  {
    slug: "local-coding-agent",
    day: "2026-07-01",
    tags: ["ai", "local-inference"],
    relatedSlugs: ["claude-md-12-rules"],
    texts: {
      ru: {
        title: "Локальный кодинг-агент на своём железе (фикстура)",
        description:
          "Что нужно, чтобы запустить кодинг-агента с локальной моделью и не зависеть от облака.",
        summary:
          "Фикстура сборки: проза без кода и ссылка на статью о правилах для агента. На этой паре проверяется переключатель языка.",
        keywords: ["локальный агент", "локальная модель"],
        body: [
          "Локальная модель медленнее облачной, но данные не покидают машину.",
          "## Что понадобится",
          "Нужны память под веса, быстрый диск и инструмент, который умеет вызывать модель по локальному адресу.",
          "## Ограничения",
          "Длинный контекст дорог по памяти, поэтому задачи стоит делить на небольшие шаги.",
        ].join("\n\n"),
        sources: [{ url: "https://github.com/ggml-org/llama.cpp", title: "llama.cpp" }],
      },
      en: {
        title: "A local coding agent on your own hardware (fixture)",
        description:
          "What it takes to run a coding agent with a local model and not depend on the cloud.",
        summary:
          "A build fixture: prose without code and a link to the article about agent rules. The language switch is tested on this pair.",
        keywords: ["local agent", "local model"],
        body: [
          "A local model is slower than a cloud one, but the data never leaves the machine.",
          "## What you need",
          "You need memory for the weights, a fast disk and a tool that can call a model at a local address.",
          "## Limits",
          "A long context is expensive in memory, so split the work into small steps.",
        ].join("\n\n"),
        sources: [{ url: "https://github.com/ggml-org/llama.cpp", title: "llama.cpp" }],
      },
    },
  },
  {
    slug: "mermaid-svg-playwright-build-time",
    day: "2026-07-20",
    tags: ["astro", "build-tooling"],
    texts: {
      ru: {
        title: "Диаграммы Mermaid в SVG на этапе сборки (фикстура)",
        description:
          "Как отрисовывать диаграммы Mermaid через Playwright при сборке и отдавать готовый SVG.",
        summary:
          "Фикстура сборки: две диаграммы Mermaid с заголовком и описанием и блок кода. Проверяет подписи к иллюстрациям.",
        keywords: ["Mermaid", "Playwright"],
        body: [
          "Диаграмма превращается в картинку во время сборки, поэтому браузеру остаётся только показать её.",
          "## Конвейер",
          MERMAID_FLOW(
            "Конвейер диаграммы",
            "Исходный блок Mermaid отрисовывается браузером при сборке и попадает на страницу как готовое изображение.",
            "Блок Mermaid",
            "Playwright",
            "Готовый SVG",
          ),
          "## Подписи",
          MERMAID_FLOW(
            "Источник подписи",
            "Заголовок диаграммы становится подписью под рисунком, а описание становится альтернативным текстом.",
            "accTitle",
            "Подпись",
            "accDescr",
          ),
          "## Команда",
          "```bash\npnpm exec playwright install --only-shell chromium\n```",
        ].join("\n\n"),
        sources: [{ url: "https://mermaid.js.org/", title: "Mermaid" }],
      },
      en: {
        title: "Mermaid diagrams as SVG at build time (fixture)",
        description:
          "How to render Mermaid diagrams through Playwright at build time and ship a ready SVG.",
        summary:
          "A build fixture: two Mermaid diagrams with a title and a description and a code block. It checks the illustration captions.",
        keywords: ["Mermaid", "Playwright"],
        body: [
          "A diagram becomes an image during the build, so the browser only has to show it.",
          "## The pipeline",
          MERMAID_FLOW(
            "The diagram pipeline",
            "A Mermaid source block is rendered by a browser at build time and reaches the page as a finished image.",
            "Mermaid block",
            "Playwright",
            "Finished SVG",
          ),
          "## Captions",
          MERMAID_FLOW(
            "Where the caption comes from",
            "The diagram title becomes the caption under the picture and the description becomes the alternative text.",
            "accTitle",
            "Caption",
            "accDescr",
          ),
          "## Command",
          "```bash\npnpm exec playwright install --only-shell chromium\n```",
        ].join("\n\n"),
        sources: [{ url: "https://mermaid.js.org/", title: "Mermaid" }],
      },
    },
  },
  {
    slug: "robots-txt-ai-crawlers-2026",
    day: "2026-08-10",
    tags: ["seo", "ai-crawlers"],
    texts: {
      ru: {
        title: "robots.txt и ИИ-краулеры в 2026 году (фикстура)",
        description: ROBOTS_DESC_RU,
        summary:
          "Фикстура сборки: тело начинается с цитаты, повторяющей описание, а в блоке robots.txt есть строка длиннее ста двадцати символов.",
        keywords: ["robots.txt", "ИИ-краулеры"],
        body: [
          `> ${ROBOTS_DESC_RU}`,
          "Каждый краулер объявляет свой user agent, и правила для него пишутся отдельно.",
          "## Пример файла",
          "```txt\nUser-agent: GPTBot\nDisallow: /admin/\n# Fixture line that is intentionally longer than one hundred and twenty characters so that the code block has to scroll sideways on a narrow screen\n```",
          "## Проверка",
          "Запросите файл с боевого адреса и сравните его с ожиданием.",
        ].join("\n\n"),
        sources: [{ url: "https://www.rfc-editor.org/rfc/rfc9309", title: "RFC 9309" }],
      },
      en: {
        title: "robots.txt and AI crawlers in 2026 (fixture)",
        description: ROBOTS_DESC_EN,
        summary:
          "A build fixture: the body starts with a quote that repeats the description, and the robots.txt block has a line longer than one hundred and twenty characters.",
        keywords: ["robots.txt", "AI crawlers"],
        body: [
          `> ${ROBOTS_DESC_EN}`,
          "Every crawler announces its own user agent, and its rules are written separately.",
          "## An example file",
          "```txt\nUser-agent: GPTBot\nDisallow: /admin/\n# Fixture line that is intentionally longer than one hundred and twenty characters so that the code block has to scroll sideways on a narrow screen\n```",
          "## Checking",
          "Request the file from the live address and compare it with what you expect.",
        ].join("\n\n"),
        sources: [{ url: "https://www.rfc-editor.org/rfc/rfc9309", title: "RFC 9309" }],
      },
    },
  },
  {
    slug: "fixture-hidden",
    day: "2026-08-20",
    tags: ["seo"],
    hiddenFromList: true,
    texts: {
      ru: {
        title: "Скрытая статья из списка (фикстура)",
        description:
          "Статья с hiddenFromList: страница есть, а в лентах, карте сайта и поиске её нет.",
        summary:
          "Фикстура сборки: скрытая из списков статья. Показывает, что порядок и видимость берутся из метаданных снимка, а не из локальной базы.",
        keywords: ["скрытая статья"],
        body: [
          "Страница открывается по прямой ссылке.",
          "## Зачем она",
          "Она проверяет видимость в списках.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
            title: "Sitemaps overview",
          },
        ],
      },
      en: {
        title: "An article hidden from the list (fixture)",
        description:
          "An article with hiddenFromList: the page exists, but feeds, the sitemap and search skip it.",
        summary:
          "A build fixture: an article hidden from lists. It shows that order and visibility come from the snapshot metadata, not from a local database.",
        keywords: ["hidden article"],
        body: [
          "The page opens by a direct link.",
          "## Why it exists",
          "It checks visibility in lists.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
            title: "Sitemaps overview",
          },
        ],
      },
    },
  },
  {
    slug: "e2e-ru-only",
    day: "2026-04-20",
    tags: ["deepseek"],
    texts: {
      ru: {
        title: "Статья только на русском (фикстура)",
        description:
          "Статья без английской версии: переключатель языка на ней должен быть выключен.",
        summary:
          "Фикстура сборки и e2e: у статьи нет английского двойника, поэтому страница не объявляет hreflang и не отдаёт ложную ссылку на перевод.",
        keywords: ["без перевода"],
        body: [
          "Английской версии у этой статьи нет.",
          "## Что проверяется",
          "Отсутствие ссылки на несуществующий перевод.",
        ].join("\n\n"),
        sources: [
          {
            url: "https://developers.google.com/search/docs/specialty/international/localized-versions",
            title: "Localized versions",
          },
        ],
      },
    },
  },
];
