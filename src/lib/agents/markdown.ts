import { canonicalUrl } from "~/lib/seo/url-policy";

type AgentLocale = "ru" | "en";

interface AgentPostLink {
  readonly title: string;
  readonly description: string;
  readonly url: string;
}

interface HomeMarkdownInput {
  readonly locale: AgentLocale;
  readonly title: string;
  readonly introduction: string;
  readonly posts: readonly AgentPostLink[];
}

const escapeLabel = (value: string): string => value.replace(/([\\\[\]])/g, "\\$1");

export const renderHomeMarkdown = ({
  locale,
  title,
  introduction,
  posts,
}: HomeMarkdownInput): string => {
  const prefix = locale === "en" ? "/en" : "";
  const labels =
    locale === "en"
      ? {
          author: "Independent technical notes by Artyom Kashuta.",
          explore: "Start here",
          blog: "All articles",
          course: "Claude Code Guide — 14 lessons",
          projects: "Projects and implementations",
          about: "About the author",
          contact: "Contact",
          recent: "Featured and recent writing",
          agents: "Agent resources",
        }
      : {
          author: "Независимые технические заметки Артёма Кашуты.",
          explore: "С чего начать",
          blog: "Все статьи",
          course: "Claude Code Guide — 14 уроков",
          projects: "Проекты и реализации",
          about: "Об авторе",
          contact: "Контакты",
          recent: "Избранные и свежие материалы",
          agents: "Ресурсы для агентов",
        };

  const postLines = posts
    .map((post) => `- [${escapeLabel(post.title)}](${post.url}) — ${post.description.trim()}`)
    .join("\n");

  return [
    "# artka.dev",
    "",
    `## ${title}`,
    "",
    introduction.trim(),
    "",
    labels.author,
    "",
    `## ${labels.explore}`,
    "",
    `- [${labels.blog}](${canonicalUrl(`${prefix}/blog/`)})`,
    `- [${labels.course}](${canonicalUrl(`${prefix}/courses/claude-code-guide/`)})`,
    `- [${labels.projects}](${canonicalUrl(`${prefix}/projects/`)})`,
    `- [${labels.about}](${canonicalUrl(`${prefix}/about/`)})`,
    `- [${labels.contact}](${canonicalUrl(`${prefix}/contact/`)})`,
    "",
    `## ${labels.recent}`,
    "",
    postLines || `- [${labels.blog}](${canonicalUrl(`${prefix}/blog/`)})`,
    "",
    `## ${labels.agents}`,
    "",
    `- [llms.txt](${canonicalUrl("/llms.txt")})`,
    `- [Full LLM digest](${canonicalUrl("/llms-full.txt")})`,
    `- [XML sitemap](${canonicalUrl("/sitemap-index.xml")})`,
    "",
  ].join("\n");
};

export const renderAgent404Markdown = (locale: AgentLocale, requestedPath: string): string => {
  if (locale === "en") {
    return [
      "# 404 — Page not found",
      "",
      `The path \`${requestedPath}\` does not exist. Use one of these canonical indexes to recover:`,
      "",
      `- [Home](${canonicalUrl("/en/")})`,
      `- [Articles](${canonicalUrl("/en/blog/")})`,
      `- [Claude Code Guide](${canonicalUrl("/en/courses/claude-code-guide/")})`,
      `- [Sitemap](${canonicalUrl("/sitemap-index.xml")})`,
      `- [Instructions for agents](${canonicalUrl("/llms.txt")})`,
      "",
    ].join("\n");
  }
  return [
    "# 404 — Страница не найдена",
    "",
    `Путь \`${requestedPath}\` не существует. Продолжить поиск можно по каноническим индексам:`,
    "",
    `- [Главная](${canonicalUrl("/")})`,
    `- [Статьи](${canonicalUrl("/blog/")})`,
    `- [Claude Code Guide](${canonicalUrl("/courses/claude-code-guide/")})`,
    `- [Карта сайта](${canonicalUrl("/sitemap-index.xml")})`,
    `- [Инструкции для агентов](${canonicalUrl("/llms.txt")})`,
    "",
  ].join("\n");
};

export interface DocumentMarkdownInput {
  readonly locale: AgentLocale;
  readonly title: string;
  readonly description: string;
  /** Absolute canonical URL of the HTML page this Markdown mirrors. */
  readonly canonical: string;
  /** Absolute canonical URL of the other-locale twin, if it exists. */
  readonly alternate?: string | null;
  readonly author: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date | null;
  readonly tags?: ReadonlyArray<string>;
  /** Extra `key: value` lines appended to the header (e.g. course, lesson). */
  readonly extra?: ReadonlyArray<readonly [string, string]>;
  /** Raw Markdown body as authored (frontmatter already stripped). */
  readonly body: string;
}

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

// YAML-ish header + the authored body. This is the representation linked from
// `<link rel="alternate" type="text/markdown">` on the HTML page; the header
// carries the canonical URL so an agent that fetched the .md directly still
// cites the HTML page. Prerendered endpoints cannot set a `Link:` header, so
// the canonical lives in the body instead.
export const renderDocumentMarkdown = (input: DocumentMarkdownInput): string => {
  const header: Array<readonly [string, string]> = [
    ["title", JSON.stringify(input.title)],
    ["description", JSON.stringify(input.description)],
    ["canonical", input.canonical],
    ...(input.alternate ? [["alternate", input.alternate] as const] : []),
    ["author", JSON.stringify(input.author)],
    ["language", input.locale === "en" ? "en-US" : "ru-RU"],
    ["published", dateOnly(input.pubDate)],
    ...(input.updatedDate ? [["updated", dateOnly(input.updatedDate)] as const] : []),
    ...(input.tags && input.tags.length > 0
      ? [["tags", `[${input.tags.join(", ")}]`] as const]
      : []),
    ...(input.extra ?? []),
  ];
  return [
    "---",
    ...header.map(([key, value]) => `${key}: ${value}`),
    "---",
    "",
    `# ${input.title}`,
    "",
    input.body.trim(),
    "",
  ].join("\n");
};
