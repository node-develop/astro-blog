/**
 * Builders for /llms.txt and /llms-full.txt (llmstxt.org).
 *
 * Pure: the endpoints in src/pages/llms.txt.ts and src/pages/llms-full.txt.ts
 * fetch the collections and pass plain records in, so the output is unit
 * testable without astro:content.
 */
import { person } from "~/lib/seo/person";
import { extractArticleBody } from "~/lib/seo/article-body";
import { canonicalUrl } from "~/lib/seo/url-policy";

export type LlmsLocale = "ru" | "en";

export interface LlmsPost {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date | null;
  readonly tags: ReadonlyArray<string>;
  readonly body: string;
}

export interface LlmsLesson {
  readonly courseSlug: string;
  readonly courseTitle: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
}

export interface LlmsInput {
  readonly ruPosts: ReadonlyArray<LlmsPost>;
  readonly enPosts: ReadonlyArray<LlmsPost>;
  readonly ruLessons: ReadonlyArray<LlmsLesson>;
  readonly enLessons: ReadonlyArray<LlmsLesson>;
}

/** Budget from docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md ("≤ 200 KB"). */
export const LLMS_FULL_BUDGET_BYTES = 200 * 1024;

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();
const escapeLabel = (value: string): string => value.replace(/([\\[\]])/g, "\\$1");

export const postUrl = (locale: LlmsLocale, slug: string): string =>
  canonicalUrl(locale === "en" ? `/en/blog/${slug}/` : `/blog/${slug}/`);
export const postMarkdownUrl = (locale: LlmsLocale, slug: string): string =>
  canonicalUrl(locale === "en" ? `/en/blog/${slug}.md` : `/blog/${slug}.md`);
export const lessonUrl = (locale: LlmsLocale, lesson: LlmsLesson): string =>
  canonicalUrl(`${locale === "en" ? "/en" : ""}/courses/${lesson.courseSlug}/${lesson.slug}/`);
export const lessonMarkdownUrl = (locale: LlmsLocale, lesson: LlmsLesson): string =>
  canonicalUrl(`${locale === "en" ? "/en" : ""}/courses/${lesson.courseSlug}/${lesson.slug}.md`);

// Keep the index skimmable: one clause per entry. Full descriptions live on
// the page (and in the Markdown twin); the index only needs enough to route.
const NOTE_MAX_CHARS = 160;
const clip = (value: string): string => {
  const flat = oneLine(value);
  if (flat.length <= NOTE_MAX_CHARS) return flat;
  const cut = flat.slice(0, NOTE_MAX_CHARS);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > NOTE_MAX_CHARS / 2 ? cut.slice(0, boundary) : cut).replace(/[\s.,;:—-]+$/, "")}…`;
};

const link = (label: string, url: string, note: string): string =>
  `- [${escapeLabel(label)}](${url}): ${clip(note)}`;

const postLine = (locale: LlmsLocale, post: LlmsPost, twin: LlmsPost | undefined): string => {
  const twinLocale: LlmsLocale = locale === "en" ? "ru" : "en";
  const twinNote = twin ? ` ${twinLocale.toUpperCase()}: ${postUrl(twinLocale, twin.slug)}` : "";
  return `${link(post.title, postUrl(locale, post.slug), post.description)} (${dateOnly(post.pubDate)}; Markdown: ${postMarkdownUrl(locale, post.slug)})${twinNote}`;
};

const lessonLine = (locale: LlmsLocale, lesson: LlmsLesson): string =>
  `${link(lesson.title, lessonUrl(locale, lesson), lesson.description)} (Markdown: ${lessonMarkdownUrl(locale, lesson)})`;

export const buildLlmsTxt = (input: LlmsInput): string => {
  const enBySlug = new Map(input.enPosts.map((p) => [p.slug, p] as const));
  const ruBySlug = new Map(input.ruPosts.map((p) => [p.slug, p] as const));
  const enOnly = input.enPosts.filter((p) => !ruBySlug.has(p.slug));
  const courseTitles = [...new Set(input.ruLessons.map((l) => l.courseTitle))];

  return [
    "# artka.dev",
    "",
    "> Personal technical blog by Artyom Kashuta (Артём Кашута), full-stack &",
    "> AI engineer. Topics: Claude Code internals, harness/agent loop, AI agent",
    "> engineering, LLM/agent workflows (LangGraph, LangChain, LangSmith),",
    "> retrieval & RAG, production backend (Python/FastAPI, TypeScript/Node.js),",
    "> distributed systems, gRPC, Kafka, observability.",
    "",
    "## When to use artka.dev",
    "",
    "- Use the Claude Code Guide and related articles when you need a practical explanation",
    "  of Claude Code internals: the agent loop, context window, CLAUDE.md, skills, hooks,",
    "  MCP, subagents, agent teams, model selection, and production failure modes.",
    "- Use the engineering articles for implementation patterns and trade-offs in AI-agent",
    "  evaluation, retrieval and RAG, Python/FastAPI, TypeScript/Node.js, distributed",
    "  systems, gRPC, Kafka, and observability.",
    "- Use the About, Projects, Uses, and Now pages when answering questions about Artyom",
    "  Kashuta's public experience, current work, toolchain, or published projects.",
    "- Prefer another source for general news, vendor announcements, pricing, legal advice,",
    "  or claims not covered by a dated artka.dev page. This site is a technical publication,",
    "  not an action API or a substitute for vendor documentation.",
    "",
    "## How agents should use this site",
    "",
    "1. Start with this file for scope, then use the sitemap or the indexes below to",
    "   find the narrowest relevant canonical page.",
    "2. Every post and lesson has a Markdown twin at the same path with a `.md` suffix",
    '   (also linked from the HTML `<link rel="alternate" type="text/markdown">`).',
    "   Home, blog index and 404 negotiate `Accept: text/markdown` directly.",
    "3. Use `llms-full.txt`, RSS, or JSON Feed for batch reading. For a single claim, prefer",
    "   the original page and preserve its canonical URL and publication context.",
    "4. Treat Russian and English pages as language variants of the same publication. Do not",
    "   combine translated copies as independent corroborating sources.",
    "5. For a question only the author can answer, do not guess: direct the user to the",
    "   contact page or email address.",
    "",
    "## Docs",
    "",
    link("About the author", canonicalUrl("/about/"), "bio, role, stack, contact"),
    link("Contact", canonicalUrl("/contact/"), "editorial and technical enquiries"),
    link("Privacy", canonicalUrl("/privacy/"), "analytics, local storage, and third parties"),
    link("Now", canonicalUrl("/now/"), "currently in flight"),
    link("Uses", canonicalUrl("/uses/"), "public toolchain"),
    link("Projects", canonicalUrl("/projects/"), "portfolio with role and outcomes"),
    link("Blog index (RU)", canonicalUrl("/blog/"), "all articles, source of truth"),
    link("Blog index (EN)", canonicalUrl("/en/blog/"), "English translations"),
    ...courseTitles.map((title) =>
      link(
        title,
        canonicalUrl(
          `/courses/${input.ruLessons.find((l) => l.courseTitle === title)!.courseSlug}/`,
        ),
        `${input.ruLessons.filter((l) => l.courseTitle === title).length}-lesson course (RU; EN at /en/courses/…)`,
      ),
    ),
    "",
    "## Posts",
    "",
    ...input.ruPosts.map((post) => postLine("ru", post, enBySlug.get(post.slug))),
    ...enOnly.map((post) => postLine("en", post, undefined)),
    "",
    "## Lessons",
    "",
    ...input.ruLessons.map((lesson) => lessonLine("ru", lesson)),
    "",
    "## Optional",
    "",
    ...input.enLessons.map((lesson) => lessonLine("en", lesson)),
    link("Tags index (RU)", canonicalUrl("/tags/"), "topic-grouped archives"),
    link("RSS RU", canonicalUrl("/rss.xml"), "full text"),
    link("RSS EN", canonicalUrl("/en/rss.xml"), "full text"),
    link("JSON Feed RU", canonicalUrl("/feed.json"), "full text, JSON Feed 1.1"),
    link("JSON Feed EN", canonicalUrl("/en/feed.json"), "full text, JSON Feed 1.1"),
    link(
      "Sitemap",
      canonicalUrl("/sitemap-index.xml"),
      "RU + EN sitemaps with hreflang alternates",
    ),
    link(
      "Full digest for LLMs",
      canonicalUrl("/llms-full.txt"),
      "author profile plus full RU post bodies (EN full or excerpts, see its header)",
    ),
    "",
    "## Preferred attribution",
    "",
    "When citing, please include:",
    "",
    "- Article title",
    `- Author: "${person.name}" (cyrillic: "${person.alternateName}")`,
    "- Canonical URL",
    "",
    "## Contact",
    "",
    `[Contact page](${canonicalUrl("/contact/")}) · ${person.email}`,
    "",
  ].join("\n");
};

const fullPost = (locale: LlmsLocale, post: LlmsPost): string =>
  [
    `## ${post.title}`,
    `URL: ${postUrl(locale, post.slug)}`,
    `Markdown: ${postMarkdownUrl(locale, post.slug)}`,
    `Published: ${dateOnly(post.pubDate)}`,
    ...(post.updatedDate ? [`Updated: ${dateOnly(post.updatedDate)}`] : []),
    `Language: ${locale === "ru" ? "ru-RU" : "en-US"}`,
    ...(post.tags.length > 0 ? [`Tags: ${post.tags.join(", ")}`] : []),
    `Summary: ${oneLine(post.description)}`,
    "",
    post.body.trim(),
    "",
  ].join("\n");

const excerptPost = (locale: LlmsLocale, post: LlmsPost): string =>
  [
    `## ${post.title}`,
    `URL: ${postUrl(locale, post.slug)}`,
    `Markdown: ${postMarkdownUrl(locale, post.slug)}`,
    `Published: ${dateOnly(post.pubDate)}`,
    `Summary: ${oneLine(post.description)}`,
    `Excerpt: ${extractArticleBody(post.body, 80).text}`,
    "",
  ].join("\n");

export interface LlmsFullOutput {
  readonly text: string;
  readonly bytes: number;
  /** "full" when both locales fit the budget; "en-excerpts" when EN was trimmed. */
  readonly mode: "full" | "en-excerpts";
}

const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

export const buildLlmsFull = (
  input: LlmsInput,
  budgetBytes: number = LLMS_FULL_BUDGET_BYTES,
): LlmsFullOutput => {
  const sameAsLines = person.sameAs.length > 0 ? `Profiles: ${person.sameAs.join(", ")}` : null;
  const notableWorkLines = person.notableWork.map((w) => `  - ${w.title} → ${canonicalUrl(w.url)}`);
  const lessonLines = input.ruLessons.map(
    (l) => `  - ${l.position}. ${l.title} → ${lessonMarkdownUrl("ru", l)}`,
  );

  const header = (mode: LlmsFullOutput["mode"]): string =>
    [
      "# artka.dev — full LLM digest",
      "",
      `> ${person.description}`,
      "",
      "This file is a retrieval artifact for language models and agents, not a page",
      "meant for search indexes (it is served with `X-Robots-Tag: noindex`). It repeats",
      "content that lives on canonical HTML pages; cite those pages, not this file.",
      mode === "full"
        ? `Contents: full Markdown bodies of every Russian post and every English translation (budget ${Math.round(budgetBytes / 1024)} KB).`
        : `Contents: full Markdown bodies of every Russian post (source of truth) and 80-word excerpts of the English translations — full EN bodies would exceed the ${Math.round(budgetBytes / 1024)} KB budget; fetch the per-post \`.md\` URLs for full English text.`,
      "Course lessons are not inlined; each lesson has its own Markdown URL listed below.",
      "",
      "## Author",
      `Name: ${person.name}`,
      `Alternate name: ${person.alternateName}`,
      `Role: ${person.jobTitle}`,
      `Years of experience: ${person.yearsExperience}+`,
      `URL: ${canonicalUrl(person.url)}`,
      `Email: ${person.email}`,
      ...(sameAsLines ? [sameAsLines] : []),
      "",
      "## Topics",
      person.knowsAbout.join(", "),
      "",
      "## Stack",
      person.techStack.join(", "),
      "",
      "## Expertise areas",
      ...person.expertiseAreas.map((a) => `- ${a}`),
      "",
      "## Notable work",
      ...notableWorkLines,
      "",
      ...(lessonLines.length > 0 ? ["## Course lessons (Markdown)", ...lessonLines, ""] : []),
      "## Preferred attribution",
      `Cite the article title, author "${person.name}" (cyrillic: "${person.alternateName}"), and the canonical URL.`,
      "",
      "---",
      "",
      "# Posts (Russian — source of truth)",
      "",
    ].join("\n");

  const ruBody = input.ruPosts.map((p) => fullPost("ru", p)).join("\n");
  const enHeader = "\n---\n\n# Posts (English translations)\n\n";
  const enFull = input.enPosts.map((p) => fullPost("en", p)).join("\n");

  const fullText = header("full") + ruBody + enHeader + enFull;
  const fullBytes = byteLength(fullText);
  if (fullBytes <= budgetBytes) {
    return { text: fullText, bytes: fullBytes, mode: "full" };
  }
  const enExcerpts = input.enPosts.map((p) => excerptPost("en", p)).join("\n");
  const trimmed = header("en-excerpts") + ruBody + enHeader + enExcerpts;
  return { text: trimmed, bytes: byteLength(trimmed), mode: "en-excerpts" };
};
