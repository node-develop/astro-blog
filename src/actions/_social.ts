import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getCollection, type CollectionEntry } from "astro:content";
import type { Article, SocialChannel } from "~/lib/social/types";

export const computeSourceHash = (input: {
  title: string;
  body: string;
  frontmatter: unknown;
}): string =>
  createHash("sha256")
    .update(input.title)
    .update("\n---\n")
    .update(input.body)
    .update("\n---\n")
    .update(JSON.stringify(input.frontmatter))
    .digest("hex");

export const loadArticle = async (
  slug: string,
  collection: "posts" = "posts",
): Promise<Article> => {
  const entries = await getCollection(collection);
  const entry = entries.find(
    (e: CollectionEntry<"posts">) =>
      e.id === slug || e.id === `${slug}.md` || e.id === `${slug}.mdx`,
  );
  if (!entry) throw new Error(`article not found: ${collection}/${slug}`);
  const fm = entry.data as Record<string, unknown>;
  const enPath = join(process.cwd(), `src/content/posts/en/${slug}.md`);
  const enPathMdx = join(process.cwd(), `src/content/posts/en/${slug}.mdx`);
  return {
    collection: "posts",
    slug,
    title: String(fm.title ?? ""),
    summary: String(fm.summary ?? fm.description ?? ""),
    body: (entry as { body?: string }).body ?? "",
    tags: (Array.isArray(fm.tags) ? fm.tags.map(String) : []) as readonly string[],
    pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(),
    cover: typeof fm.cover === "string" ? { src: fm.cover, alt: String(fm.coverAlt ?? "") } : null,
    lang: ((fm.lang as string) ?? "ru") === "en" ? "en" : "ru",
    sourceUrl: `https://artka.dev/blog/${slug}`,
    hasEnTwin: existsSync(enPath) || existsSync(enPathMdx),
  };
};

export const decideChannels = (article: Article): SocialChannel[] => {
  if (article.hasEnTwin) return ["x_en", "li_en", "tg_ru"];
  return ["tg_ru"];
};
