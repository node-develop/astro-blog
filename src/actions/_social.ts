import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "~/lib/content/frontmatter";
import { POSTS_DIR } from "~/lib/fs/paths";
import { postShareImage, resolvePostCover } from "~/lib/og/post-pages";
import { CANONICAL_ORIGIN } from "~/lib/seo/url-policy";
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
  _collection: "posts" = "posts",
): Promise<Article> => {
  const mdPath = join(POSTS_DIR, `${slug}.md`);
  const mdxPath = join(POSTS_DIR, `${slug}.mdx`);

  let raw: string;
  try {
    raw = await readFile(mdPath, "utf8");
  } catch {
    try {
      raw = await readFile(mdxPath, "utf8");
    } catch {
      throw new Error(`article not found: posts/${slug}`);
    }
  }

  const { frontmatter: fm, body } = parseFrontmatter(raw);

  const enPath = join(POSTS_DIR, `en/${slug}.md`);
  const enPathMdx = join(POSTS_DIR, `en/${slug}.mdx`);

  return {
    collection: "posts",
    slug,
    title: fm.title,
    summary: fm.summary ?? fm.description,
    body,
    tags: fm.tags as readonly string[],
    pubDate: fm.pubDate,
    // Always an absolute URL a social network can fetch: the real cover, or
    // the post's own /og card when the cover is missing or the placeholder.
    cover: {
      src: postShareImage(fm.cover, slug, "ru", CANONICAL_ORIGIN),
      alt: resolvePostCover(fm.cover).isReal ? (fm.coverAlt ?? "") : fm.title,
    },
    lang: "ru",
    sourceUrl: `https://artka.dev/blog/${slug}`,
    hasEnTwin: existsSync(enPath) || existsSync(enPathMdx),
  };
};

export const decideChannels = (article: Article): SocialChannel[] => {
  if (article.hasEnTwin) return ["x_en", "li_en", "tg_ru"];
  return ["tg_ru"];
};
