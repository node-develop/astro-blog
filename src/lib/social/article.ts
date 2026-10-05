import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { apiError, isApiError } from "../content-api/errors";
import { db } from "../db";
import { contentArticles } from "../db/schema";
import { parseFrontmatter, type Frontmatter } from "../content/frontmatter";
import { POSTS_DIR, resolveSafe } from "../fs/paths";
import { postShareImage, resolvePostCover } from "../og/post-pages";
import { CANONICAL_ORIGIN } from "../seo/url-policy";
import type { Article, SocialChannel } from "./types";

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

export const decideChannels = (article: Article): SocialChannel[] => {
  if (article.hasEnTwin) return ["x_en", "li_en", "tg_ru"];
  return ["tg_ru"];
};

/**
 * The one place that turns a parsed post (a file, or the Markdown the worker verified live) into
 * the shape the social pipeline reads. The cover is always an absolute URL a social network can
 * fetch: the real cover, or the post's own /og card when it is missing or the placeholder.
 */
export const articleFromParsed = (input: {
  slug: string;
  frontmatter: Frontmatter;
  body: string;
  hasEnTwin: boolean;
}): Article => {
  const { slug, frontmatter: fm, body, hasEnTwin } = input;
  return {
    collection: "posts",
    slug,
    title: fm.title,
    summary: fm.summary ?? fm.description,
    body,
    tags: fm.tags,
    pubDate: fm.pubDate,
    cover: {
      src: postShareImage(fm.cover, slug, "ru", CANONICAL_ORIGIN),
      alt: resolvePostCover(fm.cover).isReal ? (fm.coverAlt ?? "") : fm.title,
    },
    lang: "ru",
    sourceUrl: `https://artka.dev/blog/${slug}`,
    hasEnTwin,
  };
};

const notFound = (slug: string) =>
  apiError(404, "article_not_found", `article not found: posts/${slug}`);

// TODO(cutover): file posts are read from disk only until they are imported into
// content_articles. Removed with the file posts (docs/specs/plans/2026-10-03-api-only-migration.md).
const fileHasEnTwin = (slug: string): boolean =>
  existsSync(resolveSafe(POSTS_DIR, `en/${slug}.md`)) ||
  existsSync(resolveSafe(POSTS_DIR, `en/${slug}.mdx`));

/**
 * Reads the RU post from disk. `resolveSafe` keeps a slug from leaving the posts directory.
 * TODO(cutover): removed with the file posts (docs/specs/plans/2026-10-03-api-only-migration.md).
 */
export const loadFileArticle = async (slug: string): Promise<Article> => {
  let raw: string | null = null;
  for (const extension of ["md", "mdx"]) {
    try {
      raw = await readFile(resolveSafe(POSTS_DIR, `${slug}.${extension}`), "utf8");
      break;
    } catch {
      // Not at this extension (or outside the posts directory): try the next, then 404.
    }
  }
  if (raw === null) throw notFound(slug);
  const { frontmatter, body } = parseFrontmatter(raw);
  return articleFromParsed({ slug, frontmatter, body, hasEnTwin: fileHasEnTwin(slug) });
};

/**
 * Does the post have a live EN twin? A database row wins: published means `publishedVersion` is
 * set. Without a row, the EN file decides (TODO(cutover): file fallback, same plan reference).
 */
export const hasEnTwin = async (slug: string): Promise<boolean> => {
  const [en] = await db
    .select({ publishedVersion: contentArticles.publishedVersion })
    .from(contentArticles)
    .where(and(eq(contentArticles.slug, slug), eq(contentArticles.lang, "en")));
  return en ? en.publishedVersion !== null : fileHasEnTwin(slug);
};

/**
 * `file`: the RU file only (publish.one pushes a file and must read that file, even when an
 * unpublished API draft shares the slug). `auto`: the published API article, else the file.
 */
export type ArticleSource = "auto" | "file";

/**
 * An API article is built from `content_articles.published_content`: the exact Markdown the
 * worker verified live, never the draft `document`. The cover in its frontmatter is already an
 * asset or plain URL, so no `content_assets` lookup is needed. An article that exists but is not
 * live is a 409, not a file fallback.
 */
export const loadArticle = async (
  slug: string,
  source: ArticleSource = "auto",
): Promise<Article> => {
  if (source === "file") return loadFileArticle(slug);
  const [row] = await db
    .select({
      publishedVersion: contentArticles.publishedVersion,
      publishedContent: contentArticles.publishedContent,
    })
    .from(contentArticles)
    .where(and(eq(contentArticles.slug, slug), eq(contentArticles.lang, "ru")));
  if (!row) return { ...(await loadFileArticle(slug)), hasEnTwin: await hasEnTwin(slug) };
  if (row.publishedVersion === null || row.publishedContent === null)
    throw apiError(
      409,
      "article_not_published",
      `Article ${slug} is not published; social drafts are made from live articles only.`,
    );
  const { frontmatter, body } = parseFrontmatter(row.publishedContent);
  return articleFromParsed({ slug, frontmatter, body, hasEnTwin: await hasEnTwin(slug) });
};

/**
 * For callers that grade or regenerate drafts that may have come from a file (publish.one): the
 * live API article when there is one, the RU file when the API row exists but is not published.
 * TODO(cutover): removed with the file posts.
 */
export const loadArticleOrFile = async (slug: string): Promise<Article> => {
  try {
    return await loadArticle(slug);
  } catch (err) {
    if (isApiError(err) && err.code === "article_not_published") return loadFileArticle(slug);
    throw err;
  }
};
