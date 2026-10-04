/**
 * The database side of the editorial gates: loads what the pure checks in ./editorial.ts need
 * (peers, cover width, the live version for the ratchet) and turns findings into responses.
 * Called when a publication is requested or a draft is saved; the worker never calls it.
 *
 * Ratchet: against an article that is live (`publishedVersion`), only a finding the live version
 * did not already have is an error. A correction to a published article is therefore never blocked
 * by a rule the article already broke. A new article, an EN translation and an article that was
 * unpublished (no live version) are checked strictly.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import sharp from "sharp";
import * as yaml from "~/lib/yaml";
import type { Database } from "../db";
import { contentArticles, contentArticleVersions, contentAssets } from "../db/schema";
import { resolveSafe, UPLOADS_DIR } from "../fs/paths";
import { logger } from "../logger";
import { hasBlockNote } from "../social/critic-notes";
import { hash } from "./auth";
import { canonicalJson } from "./canonical";
import type { ArticleDocument, ArticleReviewNote } from "./contract";
import {
  evaluateEditorial,
  h2Headings,
  splitByBaseline,
  type EditorialFinding,
  type EditorialPeers,
} from "./editorial";
import { apiError } from "./errors";
import type { Tx } from "./service";

type Db = Tx | Database;

/** What a review is tied to: the exact content, so an unchanged re-save cannot shed a block. */
export const documentHash = (document: ArticleDocument): string =>
  hash(canonicalJson(JSON.parse(JSON.stringify(document))));

// ── Peers ──────────────────────────────────────────────────────────────────

// TODO(cutover): legacy file posts are published articles that have no database row; their titles
// and H2s count as peers until the files are gone (prompt 3.6,
// docs/superpowers/plans/2026-10-03-api-only-migration.md). The article's own slug is skipped
// (its committed file is its own), and so is any file whose (slug, lang) has a database row: the
// row wins, as everywhere else.
type LegacyFile = Readonly<{ slug: string; title?: string; headings: readonly string[] }>;

const readLegacyFile = (dir: string, name: string): readonly LegacyFile[] => {
  const match = /^(.+)\.mdx?$/.exec(name);
  const file = match
    ? /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(readFileSync(resolve(dir, name), "utf8"))
    : null;
  if (!match || !file) return [];
  const frontmatter = yaml.load(file[1]!) as { title?: unknown; draft?: boolean } | null;
  if (!frontmatter || frontmatter.draft === true) return [];
  return [
    {
      slug: match[1]!,
      ...(typeof frontmatter.title === "string" ? { title: frontmatter.title } : {}),
      headings: h2Headings(file[2]!),
    },
  ];
};

// The files are part of the image and do not change while the process runs: parse them once per
// directory instead of on every save under the global content lock.
const legacyCache = new Map<string, readonly LegacyFile[]>();
const legacyFiles = (dir: string): readonly LegacyFile[] => {
  const cached = legacyCache.get(dir);
  if (cached) return cached;
  const files = existsSync(dir)
    ? readdirSync(dir).flatMap((name) => readLegacyFile(dir, name))
    : [];
  legacyCache.set(dir, files);
  return files;
};

const legacyFilePeers = (document: ArticleDocument, rows: ReadonlySet<string>): EditorialPeers => {
  const files = legacyFiles(
    resolve(`src/content/posts${document.lang === "en" ? "/en" : ""}`),
  ).filter((f) => f.slug !== document.slug && !rows.has(`${f.slug}:${document.lang}`));
  return {
    titles: files.flatMap((f) => (f.title === undefined ? [] : [f.title])),
    headings: files.flatMap((f) => f.headings),
  };
};

/**
 * Titles and H2s of the PUBLISHED articles of the same language (the live version's document),
 * not of drafts: an abandoned draft must not block a real publication. The article itself and its
 * translation are excluded by slug.
 */
export const loadPeers = async (db: Db, document: ArticleDocument): Promise<EditorialPeers> => {
  const published = await db
    .select({ live: contentArticleVersions.document, current: contentArticles.document })
    .from(contentArticles)
    .leftJoin(
      contentArticleVersions,
      and(
        eq(contentArticleVersions.articleId, contentArticles.id),
        eq(contentArticleVersions.version, contentArticles.publishedVersion),
      ),
    )
    .where(
      and(
        eq(contentArticles.lang, document.lang),
        ne(contentArticles.slug, document.slug),
        isNotNull(contentArticles.publishedVersion),
      ),
    );
  const rows = await db
    .select({ slug: contentArticles.slug, lang: contentArticles.lang })
    .from(contentArticles);
  const files = legacyFilePeers(document, new Set(rows.map((r) => `${r.slug}:${r.lang}`)));
  const documents = published.map((row) => row.live ?? row.current);
  // Stored documents satisfy the contract; a malformed one must not turn a publication into a 503.
  return {
    titles: [
      ...documents.flatMap((d) => (typeof d.title === "string" ? [d.title] : [])),
      ...files.titles,
    ],
    headings: [
      ...documents.flatMap((d) => (typeof d.body === "string" ? h2Headings(d.body) : [])),
      ...files.headings,
    ],
  };
};

// ── Cover width ────────────────────────────────────────────────────────────

/**
 * Width of the cover in pixels. An asset: its row. A `/uploads/` URL: read from the file. An https
 * URL: only when it is one of our assets; otherwise unknown (null).
 */
export const coverWidthOf = async (db: Db, document: ArticleDocument): Promise<number | null> => {
  const cover = document.cover;
  if (!cover) return null;
  if ("assetId" in cover) {
    const [asset] = await db
      .select({ width: contentAssets.width })
      .from(contentAssets)
      .where(eq(contentAssets.id, cover.assetId));
    return asset?.width ?? null;
  }
  if (cover.url.startsWith("/uploads/")) {
    try {
      const metadata = await sharp(
        resolveSafe(UPLOADS_DIR, cover.url.replace(/^\/uploads\//, "")),
      ).metadata();
      return metadata.width ?? null;
    } catch (error) {
      // A missing file is reported by validateDocument; an unreadable one has no known width.
      logger.warn(
        { mod: "editorial", url: cover.url, err: String(error) },
        "cover width unreadable",
      );
      return null;
    }
  }
  const [asset] = await db
    .select({ width: contentAssets.width })
    .from(contentAssets)
    .where(eq(contentAssets.url, cover.url));
  return asset?.width ?? null;
};

// ── Report ─────────────────────────────────────────────────────────────────

/** The document of the live version, or null: a new article, an unpublished one, or a history gap. */
const liveDocument = async (db: Db, document: ArticleDocument): Promise<ArticleDocument | null> => {
  const [article] = await db
    .select()
    .from(contentArticles)
    .where(and(eq(contentArticles.slug, document.slug), eq(contentArticles.lang, document.lang)));
  if (!article || article.publishedVersion === null) return null;
  const [row] = await db
    .select({ document: contentArticleVersions.document })
    .from(contentArticleVersions)
    .where(
      and(
        eq(contentArticleVersions.articleId, article.id),
        eq(contentArticleVersions.version, article.publishedVersion),
      ),
    );
  if (!row) {
    // The history of an old article may have gaps: no baseline, so the check is strict.
    logger.warn(
      { mod: "editorial", articleId: article.id, publishedVersion: article.publishedVersion },
      "live version row missing: editorial gates run without a baseline",
    );
    return null;
  }
  return row.document;
};

export type EditorialReport = Readonly<{
  /** Every finding on the document (draft warnings). */
  all: readonly EditorialFinding[];
  /** Findings the live version did not have (or all of them without one): errors on publish. */
  errors: readonly EditorialFinding[];
  /** Findings the live version already had: warnings on publish. */
  carried: readonly EditorialFinding[];
}>;

export const editorialReport = async (
  db: Db,
  document: ArticleDocument,
): Promise<EditorialReport> => {
  const peers = await loadPeers(db, document);
  const all = evaluateEditorial({ document, coverWidth: await coverWidthOf(db, document), peers });
  const live = await liveDocument(db, document);
  const baseline = live
    ? evaluateEditorial({ document: live, coverWidth: await coverWidthOf(db, live), peers })
    : null;
  return { all, ...splitByBaseline(all, baseline) };
};

/** 422 listing every failed gate of every article at once. */
export const requirePublishable = (
  items: readonly Readonly<{ articleId?: string; errors: readonly EditorialFinding[] }>[],
): void => {
  const details = items.flatMap(({ articleId, errors }) =>
    errors.map((f) => ({
      ...f.context,
      code: f.code,
      message: f.message,
      ...(articleId ? { articleId } : {}),
    })),
  );
  if (details.length)
    throw apiError(
      422,
      "editorial_gates_failed",
      "The article does not pass the editorial gates; nothing was saved or published. Fix every item and send it again, or save as a draft.",
      details,
    );
};

// ── Review block ───────────────────────────────────────────────────────────

/**
 * The newest review of a version whose document is byte-for-byte this one: a review follows the
 * content, so saving the same text again cannot shed it, while an edited text starts clean.
 */
const matchingReview = async (db: Db, articleId: string, document: ArticleDocument) => {
  const wanted = documentHash(document);
  const rows = await db
    .select({ version: contentArticleVersions.version, review: contentArticleVersions.review })
    .from(contentArticleVersions)
    .where(
      and(
        eq(contentArticleVersions.articleId, articleId),
        isNotNull(contentArticleVersions.review),
      ),
    )
    .orderBy(desc(contentArticleVersions.version));
  return rows.find((row) => row.review?.documentHash === wanted) ?? null;
};

/**
 * 409 `editorial_block` when the newest review of this content has a block note and `force` is
 * not true. No review at all never blocks: the review is opt-in.
 */
export const requireNotBlocked = async (
  db: Db,
  items: readonly Readonly<{ articleId: string; document: ArticleDocument }>[],
  force: boolean | undefined,
): Promise<void> => {
  type Blocked = Readonly<{
    articleId: string;
    version: number;
    notes: readonly ArticleReviewNote[];
  }>;
  // Sequential on purpose: every lookup uses the one transaction connection.
  const blocked = await items.reduce<Promise<readonly Blocked[]>>(async (acc, item) => {
    const soFar = await acc;
    const found = await matchingReview(db, item.articleId, item.document);
    return found?.review && hasBlockNote(found.review.notes)
      ? [...soFar, { articleId: item.articleId, version: found.version, notes: found.review.notes }]
      : soFar;
  }, Promise.resolve([]));
  if (!blocked.length) return;
  if (force === true) {
    logger.info(
      { mod: "editorial", articleIds: blocked.map((b) => b.articleId) },
      "publication forced past a critic block",
    );
    return;
  }
  throw apiError(
    409,
    "editorial_block",
    "The critic marked this content with a block note. Fix it, or send force: true to publish anyway.",
    { items: blocked },
  );
};
