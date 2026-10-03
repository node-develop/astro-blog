import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as yaml from "~/lib/yaml";
import { resolve } from "node:path";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db, type Database } from "../db";
import {
  contentArticles,
  contentArticleVersions,
  contentAssets,
  contentApiRequests,
  contentPublications,
} from "../db/schema";
import {
  encodeCursor,
  type ArticleDocument,
  type Cursor,
  type ListArticlesQuery,
  type ListMediaQuery,
  type ListPublicationsQuery,
  type articleBySlugSchema,
  type articleListItemSchema,
  type articleListSchema,
  type articleVersionSchema,
  type mediaListSchema,
  type publicationListSchema,
  type versionListSchema,
} from "./contract";
import { articleStatus } from "./status";
import { hash } from "./auth";
import { apiError } from "./errors";
import { articlePath, articleUrl } from "./github";
import { inspectMarkdown, serializeArticle } from "./markdown";

export const CONTENT_LOCK = 71423091;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Article = typeof contentArticles.$inferSelect;
export type Publication = typeof contentPublications.$inferSelect;
export type MutationResult = { status: number; data: Record<string, unknown> };
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
export const publicationView = (
  job: Pick<
    Publication,
    | "id"
    | "articleId"
    | "version"
    | "state"
    | "commitSha"
    | "attempts"
    | "error"
    | "createdAt"
    | "updatedAt"
  >,
) => ({
  id: job.id,
  articleId: job.articleId,
  version: job.version,
  state: job.state,
  commitSha: job.commitSha,
  attempts: job.attempts,
  error: job.error,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
  statusUrl: `/api/v1/publications/${job.id}/`,
});
export const articleView = (article: Article) => ({
  id: article.id,
  version: article.version,
  article: article.document,
  publishedVersion: article.publishedVersion,
  state: article.publishedVersion === article.version ? "published" : "draft",
  url: articleUrl(article.slug, article.lang),
  createdAt: article.createdAt.toISOString(),
  updatedAt: article.updatedAt.toISOString(),
});
// TODO(cutover): a related slug that has no row in content_articles may still be a legacy file
// post. Removed in prompt 3.6 with the file posts (docs/superpowers/plans/2026-10-03-api-only-migration.md).
const isPublishedPostFile = (slug: string, lang: string): boolean => {
  const prefix = lang === "en" ? "en/" : "";
  for (const extension of ["md", "mdx"]) {
    const path = resolve(`src/content/posts/${prefix}${slug}.${extension}`);
    if (!existsSync(path)) continue;
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, "utf8"));
    if (!match) continue;
    const fm = yaml.load(match[1]!) as { draft?: boolean } | null;
    if (fm && fm.draft !== true) return true;
  }
  return false;
};

export const validateDocument = async (document: ArticleDocument, tx: Tx | Database = db) => {
  const ids = [
    ...new Set([
      ...inspectMarkdown(document.body).assetIds,
      ...(document.cover ? [document.cover.assetId] : []),
      ...(document.socialImage ? [document.socialImage.assetId] : []),
    ]),
  ];
  const assets = ids.length
    ? await tx.select().from(contentAssets).where(inArray(contentAssets.id, ids))
    : [];
  if (ids.length > 30) throw apiError(422, "too_many_images", "Use at most 30 images per article.");
  const missing = ids.filter((id) => !assets.some((asset) => asset.id === id));
  if (missing.length)
    throw apiError(422, "missing_assets", "Upload referenced images before saving the article.", {
      assetIds: missing,
    });
  for (const slug of document.relatedSlugs) {
    const [related] = await tx
      .select()
      .from(contentArticles)
      .where(and(eq(contentArticles.slug, slug), eq(contentArticles.lang, document.lang)));
    // A database row wins over a file: the file is consulted only when there is no row.
    const published = related
      ? related.publishedVersion !== null
      : isPublishedPostFile(slug, document.lang);
    if (slug === document.slug || !published)
      throw apiError(
        422,
        "invalid_related_article",
        "Related articles must exist and differ from this article.",
        { slug },
      );
  }
  return {
    assets,
    warnings: [
      ...(!document.cover ? ["cover_missing: a default social image will be used"] : []),
      ...(document.description.length < 70
        ? ["short_description: consider a more informative search description"]
        : []),
    ],
  };
};

export const mutateOnce = async (
  keyId: string,
  idempotencyKey: string,
  request: unknown,
  operation: (tx: Tx) => Promise<MutationResult>,
): Promise<MutationResult> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CONTENT_LOCK})`);
    const digest = hash(canonicalJson(request));
    const [previous] = await tx
      .select()
      .from(contentApiRequests)
      .where(
        and(
          eq(contentApiRequests.keyId, keyId),
          eq(contentApiRequests.idempotencyKey, idempotencyKey),
        ),
      );
    if (previous) {
      if (previous.requestHash !== digest)
        throw apiError(
          409,
          "idempotency_conflict",
          "This Idempotency-Key was used for a different request.",
        );
      return { status: previous.status, data: previous.response };
    }
    const result = await operation(tx);
    await tx.insert(contentApiRequests).values({
      keyId,
      idempotencyKey,
      requestHash: digest,
      response: result.data,
      status: result.status,
    });
    return result;
  });

export const requireArticle = async (tx: Tx | Database, id: string) => {
  const [article] = await tx.select().from(contentArticles).where(eq(contentArticles.id, id));
  if (!article) throw apiError(404, "not_found", "Article not found.");
  return article;
};
const requireIdle = async (tx: Tx, id: string) => {
  const [active] = await tx
    .select()
    .from(contentPublications)
    .where(
      and(
        eq(contentPublications.articleId, id),
        inArray(contentPublications.state, ["queued", "publishing"]),
      ),
    );
  if (active)
    throw apiError(
      409,
      "publication_in_progress",
      "Wait for the active publication before changing this article.",
      { publicationId: active.id },
    );
};

export const enqueuePublication = async (tx: Tx, article: Article, keyId: string) => {
  await requireIdle(tx, article.id);
  const { assets } = await validateDocument(article.document, tx);
  const id = randomUUID();
  const now = new Date();
  const content = await serializeArticle(
    article.document,
    assets,
    id,
    article.firstPublishedAt ?? now,
    article.firstPublishedAt ? now : undefined,
  );
  const [job] = await tx
    .insert(contentPublications)
    .values({
      id,
      articleId: article.id,
      version: article.version,
      content,
      keyId,
      createdAt: now,
    })
    .returning();
  return job!;
};

export const createArticle = async (
  tx: Tx,
  document: ArticleDocument,
  mode: "draft" | "publish",
  keyId: string,
): Promise<MutationResult> => {
  const candidates = await tx
    .select()
    .from(contentArticles)
    .where(
      or(
        eq(contentArticles.externalId, document.externalId),
        eq(contentArticles.slug, document.slug),
      ),
    );
  if (
    candidates.some(
      (a) =>
        a.lang === document.lang ||
        a.externalId !== document.externalId ||
        a.slug !== document.slug,
    )
  )
    throw apiError(
      409,
      "article_exists",
      "External ID or slug is already in use. Translations must share externalId and slug.",
      { articleIds: candidates.map((a) => a.id) },
    );
  const path = articlePath(document.slug, document.lang);
  // TODO(cutover): while legacy file posts exist, an article on their slug would make the worker
  // overwrite the file. Slug occupancy becomes database-only in prompt 3.6
  // (docs/superpowers/plans/2026-10-03-api-only-migration.md).
  if (existsSync(resolve(path)) || existsSync(resolve(`${path}x`)))
    throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
  const { warnings } = await validateDocument(document, tx);
  const [article] = await tx
    .insert(contentArticles)
    .values({
      document,
      externalId: document.externalId,
      slug: document.slug,
      lang: document.lang,
      keyId,
    })
    .returning();
  const job = mode === "publish" ? await enqueuePublication(tx, article!, keyId) : null;
  return {
    status: job ? 202 : 201,
    data: { ...articleView(article!), publication: job && publicationView(job), warnings },
  };
};

export const updateArticle = async (
  tx: Tx,
  id: string,
  input: {
    article: ArticleDocument;
    mode: "draft" | "publish";
    expectedVersion: number;
  },
  keyId: string,
): Promise<MutationResult> => {
  const current = await requireArticle(tx, id);
  if (current.version !== input.expectedVersion)
    throw apiError(409, "version_conflict", "Read the current article before updating.", {
      version: current.version,
    });
  await requireIdle(tx, id);
  if (
    input.article.externalId !== current.externalId ||
    input.article.slug !== current.slug ||
    input.article.lang !== current.lang
  )
    throw apiError(409, "immutable_identity", "externalId, slug and lang cannot change.");
  const { warnings } = await validateDocument(input.article, tx);
  const [article] = await tx
    .update(contentArticles)
    .set({
      document: input.article,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(contentArticles.id, id))
    .returning();
  const job = input.mode === "publish" ? await enqueuePublication(tx, article!, keyId) : null;
  return {
    status: job ? 202 : 200,
    data: { ...articleView(article!), publication: job && publicationView(job), warnings },
  };
};

// ── Reading ────────────────────────────────────────────────────────────────

/** Timestamps are compared and cursored as Postgres text: a JS Date keeps only milliseconds. */
const microseconds = (column: unknown) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const before = (column: object, idColumn: object, cursor: Cursor): SQL =>
  sql`(${column}, ${idColumn}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
const page = <T>(
  rows: readonly T[],
  limit: number,
  key: (row: T) => Cursor,
): Readonly<{ items: readonly T[]; nextCursor: string | null }> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(key(last)) : null,
  };
};
const jsonColumn = <T>(expression: SQL) =>
  expression.mapWith(
    (value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T,
  );

/** Light columns only: the body of a document is never read for listings. */
const articleItemColumns = {
  id: contentArticles.id,
  slug: contentArticles.slug,
  lang: contentArticles.lang,
  title: sql<string>`${contentArticles.document}->>'title'`,
  tags: jsonColumn<string[]>(sql`${contentArticles.document}->'tags'`),
  agent: sql<string>`${contentArticles.document}->'provenance'->>'agent'`,
  version: contentArticles.version,
  publishedVersion: contentArticles.publishedVersion,
  unpublishedAt: contentArticles.unpublishedAt,
  sourceVersion: contentArticles.sourceVersion,
  updatedAt: contentArticles.updatedAt,
  cursorAt: microseconds(contentArticles.updatedAt),
};
const latestPublications = (database: Database) =>
  database
    .selectDistinctOn([contentPublications.articleId], {
      articleId: contentPublications.articleId,
      state: contentPublications.state,
    })
    .from(contentPublications)
    .orderBy(
      contentPublications.articleId,
      desc(contentPublications.createdAt),
      desc(contentPublications.id),
    )
    .as("latest_publication");
const selectArticleItems = async (database: Database, where: SQL | undefined, limit?: number) => {
  const latest = latestPublications(database);
  const query = database
    .select({ ...articleItemColumns, latestState: latest.state })
    .from(contentArticles)
    .leftJoin(latest, eq(latest.articleId, contentArticles.id))
    .where(where)
    .orderBy(desc(contentArticles.updatedAt), desc(contentArticles.id))
    .$dynamic();
  return limit === undefined ? query : query.limit(limit);
};
type ArticleRow = Awaited<ReturnType<typeof selectArticleItems>>[number];
const articleItem = (row: ArticleRow): z.output<typeof articleListItemSchema> => ({
  id: row.id,
  slug: row.slug,
  lang: row.lang as "ru" | "en",
  title: row.title,
  tags: row.tags,
  url: articleUrl(row.slug, row.lang),
  provenance: { agent: row.agent },
  version: row.version,
  publishedVersion: row.publishedVersion,
  status: articleStatus({
    version: row.version,
    publishedVersion: row.publishedVersion,
    unpublishedAt: row.unpublishedAt,
    latestPublication: row.latestState ? { state: row.latestState } : null,
  }),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Filters, order and cursor run in SQL; `status` is computed by `articleStatus` and so is filtered
 * in TypeScript, over light columns of every row after the cursor (O(N) per call, fine for a blog).
 * Without `status` the limit is applied in SQL.
 */
export const listArticles = async (
  database: Database,
  query: ListArticlesQuery,
): Promise<z.output<typeof articleListSchema>> => {
  const escaped = query.q?.replace(/[\\%_]/g, "\\$&");
  const where = and(
    query.lang ? eq(contentArticles.lang, query.lang) : undefined,
    query.agent
      ? sql`${contentArticles.document}->'provenance'->>'agent' = ${query.agent}`
      : undefined,
    query.tag
      ? sql`${contentArticles.document}->'tags' @> ${JSON.stringify([query.tag])}::jsonb`
      : undefined,
    escaped
      ? or(
          ilike(contentArticles.slug, `%${escaped}%`),
          ilike(sql`${contentArticles.document}->>'title'`, `%${escaped}%`),
        )
      : undefined,
    query.cursor ? before(contentArticles.updatedAt, contentArticles.id, query.cursor) : undefined,
  );
  const rows = await selectArticleItems(
    database,
    where,
    query.status ? undefined : query.limit + 1,
  );
  const mapped = rows.map((row) => ({ item: articleItem(row), cursorAt: row.cursorAt }));
  const matching = query.status
    ? mapped.filter(({ item }) => item.status === query.status)
    : mapped;
  const { items, nextCursor } = page(matching, query.limit, ({ item, cursorAt }) => ({
    at: cursorAt,
    id: item.id,
  }));
  return { items: items.map(({ item }) => item), nextCursor };
};

/** Covers API-managed articles only: a 404 here does not mean the slug is free (site files may own it). */
export const articlesBySlug = async (
  database: Database,
  slug: string,
): Promise<z.output<typeof articleBySlugSchema>> => {
  const rows = await selectArticleItems(database, eq(contentArticles.slug, slug));
  const ru = rows.find((row) => row.lang === "ru");
  const en = rows.find((row) => row.lang === "en");
  if (!ru && !en) throw apiError(404, "not_found", "Article not found.");
  return {
    ru: ru ? articleItem(ru) : null,
    en: en ? articleItem(en) : null,
    translation:
      ru && en
        ? {
            sourceVersion: en.sourceVersion,
            stale: en.sourceVersion === null || en.sourceVersion < ru.version,
          }
        : null,
  };
};

const versionMeta = (row: {
  articleId: string;
  version: number;
  actorKeyId: string | null;
  actorUserId: string | null;
  createdAt: Date;
}) => ({
  articleId: row.articleId,
  version: row.version,
  actorKeyId: row.actorKeyId,
  actorUserId: row.actorUserId,
  createdAt: row.createdAt.toISOString(),
});
/** Returns the rows that exist: history written before versioning may have gaps. */
export const listVersions = async (
  database: Database,
  id: string,
): Promise<z.output<typeof versionListSchema>> => {
  const article = await requireArticle(database, id);
  const rows = await database
    .select({
      articleId: contentArticleVersions.articleId,
      version: contentArticleVersions.version,
      actorKeyId: contentArticleVersions.actorKeyId,
      actorUserId: contentArticleVersions.actorUserId,
      createdAt: contentArticleVersions.createdAt,
    })
    .from(contentArticleVersions)
    .where(eq(contentArticleVersions.articleId, id))
    .orderBy(desc(contentArticleVersions.version));
  return { currentVersion: article.version, items: rows.map(versionMeta) };
};
export const getVersion = async (
  database: Database,
  id: string,
  version: number,
): Promise<z.output<typeof articleVersionSchema>> => {
  const article = await requireArticle(database, id);
  const [row] = await database
    .select()
    .from(contentArticleVersions)
    .where(
      and(eq(contentArticleVersions.articleId, id), eq(contentArticleVersions.version, version)),
    );
  if (!row)
    throw apiError(404, "not_found", "Version not found.", {
      version,
      currentVersion: article.version,
    });
  return { ...versionMeta(row), document: row.document };
};

/** Keyed by createdAt, not updatedAt: a publication's updatedAt changes while a client pages. */
export const listPublications = async (
  database: Database,
  query: ListPublicationsQuery,
): Promise<z.output<typeof publicationListSchema>> => {
  const rows = await database
    .select({
      id: contentPublications.id,
      articleId: contentPublications.articleId,
      version: contentPublications.version,
      state: contentPublications.state,
      commitSha: contentPublications.commitSha,
      attempts: contentPublications.attempts,
      error: contentPublications.error,
      kind: contentPublications.kind,
      createdAt: contentPublications.createdAt,
      updatedAt: contentPublications.updatedAt,
      cursorAt: microseconds(contentPublications.createdAt),
    })
    .from(contentPublications)
    .where(
      and(
        query.articleId ? eq(contentPublications.articleId, query.articleId) : undefined,
        query.state ? eq(contentPublications.state, query.state) : undefined,
        query.cursor
          ? before(contentPublications.createdAt, contentPublications.id, query.cursor)
          : undefined,
      ),
    )
    .orderBy(desc(contentPublications.createdAt), desc(contentPublications.id))
    .limit(query.limit + 1);
  const { items, nextCursor } = page(rows, query.limit, (row) => ({
    at: row.cursorAt,
    id: row.id,
  }));
  return {
    items: items.map((row) => ({ ...publicationView(row), kind: row.kind })),
    nextCursor,
  };
};

/** Public fields only: never `hash`, `objectKey` or `keyId`. */
export const listMedia = async (
  database: Database,
  query: ListMediaQuery,
): Promise<z.output<typeof mediaListSchema>> => {
  const rows = await database
    .select({
      id: contentAssets.id,
      url: contentAssets.url,
      width: contentAssets.width,
      height: contentAssets.height,
      mimeType: contentAssets.mimeType,
      byteSize: contentAssets.byteSize,
      createdAt: contentAssets.createdAt,
      cursorAt: microseconds(contentAssets.createdAt),
    })
    .from(contentAssets)
    .where(
      query.cursor ? before(contentAssets.createdAt, contentAssets.id, query.cursor) : undefined,
    )
    .orderBy(desc(contentAssets.createdAt), desc(contentAssets.id))
    .limit(query.limit + 1);
  const { items, nextCursor } = page(rows, query.limit, (row) => ({
    at: row.cursorAt,
    id: row.id,
  }));
  return {
    items: items.map(({ cursorAt: _cursorAt, createdAt, ...rest }) => ({
      ...rest,
      createdAt: createdAt.toISOString(),
    })),
    nextCursor,
  };
};
