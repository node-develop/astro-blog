import type { APIContext } from "astro";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { extractArticleBody } from "~/lib/seo/article-body";
import { canonicalUrl } from "~/lib/seo/url-policy";

export const prerender = true;

const renderPost = (
  locale: "ru" | "en",
  entry: { id: string; data: { title: string; description: string; pubDate: Date }; body?: string },
): string => {
  const slug = entry.id.replace(/^en\//, "").replace(/\.(md|mdx)$/, "");
  const url = canonicalUrl(locale === "ru" ? `/blog/${slug}` : `/en/blog/${slug}`);
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

  const sameAsLines = person.sameAs.length > 0 ? `Profiles: ${person.sameAs.join(", ")}` : null;
  const notableWorkLines = person.notableWork.map((w) => `  - ${w.title} → ${canonicalUrl(w.url)}`);
  const header = [
    "# artka.dev — full LLM digest",
    "",
    `> ${person.description}`,
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
    "## Preferred attribution",
    `Cite the article title, author "${person.name}" (cyrillic: "${person.alternateName}"), and the canonical URL.`,
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
