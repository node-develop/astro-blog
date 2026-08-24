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
