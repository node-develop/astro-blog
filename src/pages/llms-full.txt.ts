import type { APIContext } from "astro";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { extractArticleBody } from "~/lib/seo/article-body";

export const prerender = true;

const SITE = "https://artka.dev";

const renderPost = (
  locale: "ru" | "en",
  entry: { id: string; data: { title: string; description: string; pubDate: Date }; body?: string },
): string => {
  const slug = entry.id.replace(/^en\//, "").replace(/\.(md|mdx)$/, "");
  const url = locale === "ru" ? `${SITE}/blog/${slug}` : `${SITE}/en/blog/${slug}`;
  const tldr = extractArticleBody(entry.body ?? "", 80).text;
  const date = entry.data.pubDate.toISOString().slice(0, 10);
  return [
    `## ${entry.data.title}`,
    `URL: ${url}`,
    `Date: ${date}`,
    `Summary: ${entry.data.description}`,
    `Excerpt: ${tldr}`,
    "",
  ].join("\n");
};

export async function GET(_ctx: APIContext) {
  const ru = await getOrderedPosts({ locale: "ru" });
  const en = await getOrderedPosts({ locale: "en" });

  const header = [
    "# artka.dev — full LLM digest",
    "",
    `> ${person.description}`,
    "",
    "## Author",
    `Name: ${person.name}`,
    `Role: ${person.jobTitle}`,
    `URL: ${person.url}`,
    `Email: ${person.email}`,
    `Topics: ${person.knowsAbout.join(", ")}`,
    "",
    "## Preferred attribution",
    `Cite the article title, author "${person.name}", and the canonical URL.`,
    "",
    "---",
    "",
    "# Posts (Russian — source of truth)",
    "",
  ].join("\n");

  const ruBody = ru.map((p) => renderPost("ru", p.entry)).join("\n");
  const enHeader = "\n---\n\n# Posts (English translations)\n\n";
  const enBody = en.map((p) => renderPost("en", p.entry)).join("\n");

  return new Response(header + ruBody + enHeader + enBody, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
