import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as yaml from "~/lib/yaml";
import { resolve } from "node:path";
import { and, desc, eq, ilike, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
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
  articleDocumentSchema,
  completeArticle,
  encodeCursor,
  type ArticleDocument,
  type ArticleInput,
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
import { articleStatus, ownsCommittedFile } from "./status";
import { hash, type Actor } from "./auth";
import { apiError } from "./errors";
import { articlePath, articleUrl } from "./github";
import { coverUrlOf, uploadsFileExists } from "./cover";
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
    | "kind"
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
  kind: job.kind,
  version: job.version,
  state: job.state,
  commitSha: job.commitSha,
  attempts: job.attempts,
  error: job.error,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
  statusUrl: `/api/v1/publications/${job.id}/`,
});
/**
 * `latest` is the article's newest publication (or the job just created). `state` is kept for
 * compatibility and deprecated: use `status`.
 */
export const articleView = (article: Article, latest: Pick<Publication, "state"> | null) => ({
  id: article.id,
  version: article.version,
  article: article.document,
  publishedVersion: article.publishedVersion,
  state: article.publishedVersion === article.version ? "published" : "draft",
  status: articleStatus({
    version: article.version,
    publishedVersion: article.publishedVersion,
    unpublishedAt: article.unpublishedAt,
    latestPublication: latest,
  }),
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

/**
 * Is `slug` a published article in `lang`? A database row wins over a file: the file is consulted
 * only when there is no row.
 */
export const relatedIsPublished = async (
  tx: Tx | Database,
  slug: string,
  lang: string,
): Promise<boolean> => {
  const [related] = await tx
    .select()
    .from(contentArticles)
    .where(and(eq(contentArticles.slug, slug), eq(contentArticles.lang, lang)));
  return related ? related.publishedVersion !== null : isPublishedPostFile(slug, lang);
};

// TODO(cutover): while legacy file posts exist, an article on their slug would make the worker
// overwrite the file. Slug occupancy becomes database-only in prompt 3.6
// (docs/superpowers/plans/2026-10-03-api-only-migration.md).
export const fileOwnsSlug = (slug: string, lang: "ru" | "en"): boolean => {
  const path = articlePath(slug, lang);
  return existsSync(resolve(path)) || existsSync(resolve(`${path}x`));
};

export const validateDocument = async (document: ArticleDocument, tx: Tx | Database = db) => {
  const ids = [
    ...new Set([
      ...inspectMarkdown(document.body).assetIds,
      ...(document.cover && "assetId" in document.cover ? [document.cover.assetId] : []),
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
  // A site cover is checked here, before the Markdown is committed: a mistyped path must not go
  // live as a broken image. An https cover is probed by the worker just before the commit.
  const coverUrl = coverUrlOf(document.cover);
  if (coverUrl?.startsWith("/uploads/") && !uploadsFileExists(coverUrl))
    throw apiError(422, "missing_cover_file", "The cover file does not exist under /uploads/.", {
      url: coverUrl,
    });
  for (const slug of document.relatedSlugs) {
    const published = await relatedIsPublished(tx, slug, document.lang);
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

/** One writer at a time across replicas: the transaction holds the content advisory lock. */
export const withContentLock = <T>(operation: (tx: Tx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CONTENT_LOCK})`);
    return operation(tx);
  });

/**
 * The stored response of an earlier request with this key, or null. The same key with a different
 * request is 409 `idempotency_conflict`.
 */
export const findReplay = async (
  database: Tx | Database,
  keyId: string,
  idempotencyKey: string,
  request: unknown,
): Promise<MutationResult | null> => {
  const [previous] = await database
    .select()
    .from(contentApiRequests)
    .where(
      and(
        eq(contentApiRequests.keyId, keyId),
        eq(contentApiRequests.idempotencyKey, idempotencyKey),
      ),
    );
  if (!previous) return null;
  if (previous.requestHash !== hash(canonicalJson(request)))
    throw apiError(
      409,
      "idempotency_conflict",
      "This Idempotency-Key was used for a different request.",
    );
  return { status: previous.status, data: previous.response };
};

export const mutateOnce = async (
  keyId: string,
  idempotencyKey: string,
  request: unknown,
  operation: (tx: Tx) => Promise<MutationResult>,
): Promise<MutationResult> =>
  withContentLock(async (tx) => {
    const replay = await findReplay(tx, keyId, idempotencyKey, request);
    if (replay) return replay;
    const digest = hash(canonicalJson(request));
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
/**
 * Refuses while a publication is active and returns the article's newest publication (or null),
 * so a caller that needs `status` does not ask again. Callers that enqueue a job should pass that
 * job to `articleView` instead: the returned row is from before the enqueue.
 */
export const requireIdle = async (tx: Tx, id: string): Promise<Publication | null> => {
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
  const [latest] = await tx
    .select()
    .from(contentPublications)
    .where(eq(contentPublications.articleId, id))
    .orderBy(desc(contentPublications.createdAt), desc(contentPublications.id))
    .limit(1);
  return latest ?? null;
};

const publicationEvents = (tx: Tx, id: string) =>
  tx
    .select({
      kind: contentPublications.kind,
      state: contentPublications.state,
      commitSha: contentPublications.commitSha,
      createdAt: contentPublications.createdAt,
    })
    .from(contentPublications)
    .where(eq(contentPublications.articleId, id));

/**
 * `createdAt` fixes the order of jobs of one batch (the worker takes the oldest due job first);
 * `batchId` ties the publications requested together.
 */
export const enqueuePublication = async (
  tx: Tx,
  article: Article,
  actor: Actor,
  opts: Readonly<{ batchId?: string; createdAt?: Date; idle?: true }> = {},
) => {
  // `idle`: the caller has just run requireIdle for this article in the same transaction.
  if (!opts.idle) await requireIdle(tx, article.id);
  const { assets } = await validateDocument(article.document, tx);
  const id = randomUUID();
  const now = opts.createdAt ?? new Date();
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
      keyId: actor.keyId,
      batchId: opts.batchId ?? null,
      createdAt: now,
    })
    .returning();
  return job!;
};

const recordVersion = async (tx: Tx, article: Article, actor: Actor) => {
  await tx.insert(contentArticleVersions).values({
    articleId: article.id,
    version: article.version,
    document: article.document,
    actorKeyId: actor.keyId,
    actorUserId: actor.userId,
  });
};

/** EN bookkeeping that travels with a write; see `translationFlags`. */
export type VersionFlags = Readonly<{ sourceVersion?: number | null; manuallyEdited?: boolean }>;
/** A translation: the RU version it was made from. Passed by the translate path only. */
export type TranslationMark = Readonly<{ sourceVersion: number }>;

/**
 * Who wrote an EN article decides its protection. The translate path records the RU version and
 * clears `manually_edited`; any other write (create, PUT) sets it. RU articles carry neither.
 */
const translationFlags = (lang: string, translation?: TranslationMark): VersionFlags =>
  lang !== "en"
    ? {}
    : translation
      ? { sourceVersion: translation.sourceVersion, manuallyEdited: false }
      : { manuallyEdited: true };

/**
 * The one write path of a new document version: bumps the version and keeps the history row in
 * the same transaction. Used by update, restore and translate.
 */
export const writeVersion = async (
  tx: Tx,
  current: Article,
  document: ArticleDocument,
  actor: Actor,
  flags: VersionFlags = {},
): Promise<Article> => {
  const [article] = await tx
    .update(contentArticles)
    .set({
      document,
      version: current.version + 1,
      updatedAt: new Date(),
      ...(flags.sourceVersion !== undefined ? { sourceVersion: flags.sourceVersion } : {}),
      ...(flags.manuallyEdited !== undefined ? { manuallyEdited: flags.manuallyEdited } : {}),
    })
    .where(eq(contentArticles.id, current.id))
    .returning();
  await recordVersion(tx, article!, actor);
  return article!;
};

export const createArticle = async (
  tx: Tx,
  input: ArticleInput,
  mode: "draft" | "publish",
  actor: Actor,
  agent: string,
  translation?: TranslationMark,
): Promise<MutationResult> => {
  // Under the lock, so the default cannot race with the twin's creation: the other language of
  // this slug decides the externalId, otherwise the slug does. Translations share both.
  const twin = (
    await tx.select().from(contentArticles).where(eq(contentArticles.slug, input.slug))
  ).filter((a) => a.lang !== input.lang)[0];
  const document = completeArticle(input, { externalId: twin?.externalId ?? input.slug, agent });
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
  if (fileOwnsSlug(document.slug, document.lang))
    throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
  const { warnings } = await validateDocument(document, tx);
  const [article] = await tx
    .insert(contentArticles)
    .values({
      document,
      externalId: document.externalId,
      slug: document.slug,
      lang: document.lang,
      keyId: actor.keyId,
      ...translationFlags(document.lang, translation),
    })
    .returning();
  await recordVersion(tx, article!, actor);
  const job = mode === "publish" ? await enqueuePublication(tx, article!, actor) : null;
  return {
    status: job ? 202 : 201,
    data: { ...articleView(article!, job), publication: job && publicationView(job), warnings },
  };
};

export const updateArticle = async (
  tx: Tx,
  id: string,
  input: {
    article: ArticleInput;
    mode: "draft" | "publish";
    expectedVersion: number;
  },
  actor: Actor,
  agent: string,
  translation?: TranslationMark,
): Promise<MutationResult> => {
  const current = await requireArticle(tx, id);
  if (current.version !== input.expectedVersion)
    throw apiError(409, "version_conflict", "Read the current article before updating.", {
      version: current.version,
    });
  const latest = await requireIdle(tx, id);
  // The identity is immutable, so an omitted externalId means "the stored one" (not the slug: an
  // article whose externalId differs from its slug would otherwise fail every such update). An
  // omitted agent keeps the one on record: the saving key is already in the version history.
  const document = completeArticle(input.article, {
    externalId: current.externalId,
    agent: current.document.provenance.agent || agent,
  });
  if (
    document.externalId !== current.externalId ||
    document.slug !== current.slug ||
    document.lang !== current.lang
  )
    throw apiError(409, "immutable_identity", "externalId, slug and lang cannot change.");
  const { warnings } = await validateDocument(document, tx);
  const article = await writeVersion(
    tx,
    current,
    document,
    actor,
    translationFlags(current.lang, translation),
  );
  const job =
    input.mode === "publish" ? await enqueuePublication(tx, article, actor, { idle: true }) : null;
  return {
    status: job ? 202 : 200,
    data: {
      ...articleView(article, job ?? latest),
      publication: job && publicationView(job),
      warnings,
    },
  };
};

/** A new version that carries the document of version `n`; history is never rewritten. */
export const restoreVersion = async (
  tx: Tx,
  id: string,
  n: number,
  expectedVersion: number,
  actor: Actor,
): Promise<MutationResult> => {
  const current = await requireArticle(tx, id);
  if (current.version !== expectedVersion)
    throw apiError(409, "version_conflict", "Read the current article before restoring.", {
      version: current.version,
    });
  const latest = await requireIdle(tx, id);
  const [row] = await tx
    .select()
    .from(contentArticleVersions)
    .where(and(eq(contentArticleVersions.articleId, id), eq(contentArticleVersions.version, n)));
  if (!row)
    throw apiError(404, "not_found", "Version not found.", {
      version: n,
      currentVersion: current.version,
    });
  // History is "as saved": a document written under an older contract may no longer pass.
  const parsed = articleDocumentSchema.safeParse(row.document);
  if (!parsed.success)
    throw apiError(
      422,
      "version_incompatible",
      "This version no longer satisfies the current article contract.",
      {
        version: n,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    );
  if (
    parsed.data.externalId !== current.externalId ||
    parsed.data.slug !== current.slug ||
    parsed.data.lang !== current.lang
  )
    throw apiError(
      409,
      "immutable_identity",
      "This version has a different externalId, slug or lang than the article.",
      { version: n },
    );
  const { warnings } = await validateDocument(parsed.data, tx);
  // An older EN document is a manual state, and its RU base is unknown: protected, and stale.
  const article = await writeVersion(
    tx,
    current,
    parsed.data,
    actor,
    current.lang === "en" ? { manuallyEdited: true, sourceVersion: null } : {},
  );
  return {
    status: 200,
    data: { ...articleView(article, latest), restoredFrom: n, warnings },
  };
};

/**
 * Deletes a draft that never went live. Checks, in order: 404; 412 when `ifMatch` is not the
 * current version; 409 `publication_in_progress`; 409 `unpublish_first` while the article is
 * published or its file sits in git (a failed first publication whose commit landed: deleting the
 * row would leave a non-draft file for the next build); 409 `was_published` for an article that
 * ever went live, so the history of anything that was public survives. Publications are deleted
 * first (`content_publications.article_id` is RESTRICT); versions go with the article (CASCADE).
 * `posts_meta` is shared by both languages and is left alone.
 */
export const deleteDraft = async (tx: Tx, id: string, ifMatch: number): Promise<MutationResult> => {
  const article = await requireArticle(tx, id);
  if (article.version !== ifMatch)
    throw apiError(412, "precondition_failed", "If-Match does not match the current version.", {
      version: article.version,
    });
  await requireIdle(tx, id);
  if (article.publishedVersion !== null || ownsCommittedFile(await publicationEvents(tx, id)))
    throw apiError(
      409,
      "unpublish_first",
      "The article is published or its file is already committed; unpublish it first.",
    );
  if (article.firstPublishedAt !== null)
    throw apiError(
      409,
      "was_published",
      "The article was published before; its history is kept and it cannot be deleted.",
    );
  await tx.delete(contentPublications).where(eq(contentPublications.articleId, id));
  await tx.delete(contentArticles).where(eq(contentArticles.id, id));
  return { status: 200, data: { id, deleted: true } };
};

/**
 * Queues the removal of the article's file (this language only). An article that is not
 * published and has no file in git has nothing to remove: `unchanged` when it already was
 * unpublished, else 409 `not_published`. Refused while a published article of the same language
 * links to it (409 `referenced_by_related`). The check reads that article's `publishedContent`
 * (the committed Markdown), not its draft document: only the live link would die. Nothing is validated against the document: it is not being published.
 */
export const enqueueUnpublication = async (
  tx: Tx,
  article: Article,
  expectedVersion: number,
  actor: Actor,
): Promise<MutationResult> => {
  if (article.version !== expectedVersion)
    throw apiError(409, "version_conflict", "Read the current version before unpublishing.", {
      version: article.version,
    });
  const latest = await requireIdle(tx, article.id);
  if (
    article.publishedVersion === null &&
    !ownsCommittedFile(await publicationEvents(tx, article.id))
  ) {
    if (article.unpublishedAt)
      return { status: 200, data: { ...articleView(article, latest), unchanged: true } };
    throw apiError(409, "not_published", "The article is not published.");
  }
  const referencing = await tx
    .select({ id: contentArticles.id })
    .from(contentArticles)
    .where(
      and(
        eq(contentArticles.lang, article.lang),
        ne(contentArticles.id, article.id),
        isNotNull(contentArticles.publishedVersion),
        // What is live, not the draft: the hard link sits in the committed Markdown.
        sql`strpos(${contentArticles.publishedContent}, ${`(${article.lang === "en" ? "/en" : ""}/blog/${article.slug}/)`}) > 0`,
      ),
    );
  if (referencing.length)
    throw apiError(
      409,
      "referenced_by_related",
      "Published articles link to this one in relatedSlugs; remove the links first.",
      { articleIds: referencing.map((row) => row.id) },
    );
  const [job] = await tx
    .insert(contentPublications)
    .values({
      articleId: article.id,
      kind: "unpublish",
      version: article.version,
      content: "",
      keyId: actor.keyId,
      // App clock like enqueuePublication: "newest publication" compares both kinds.
      createdAt: new Date(),
    })
    .returning();
  return {
    status: 202,
    data: { ...articleView(article, job!), publication: publicationView(job!) },
  };
};

/**
 * Publishes the ru and en twins of one slug together, all or nothing (the caller's transaction).
 * An item whose published version is already current and whose newest publication is not an
 * unpublish is `unchanged` and gets no row. The jobs share a `batchId` and are created one
 * millisecond apart in the order ru, en, so the worker handles ru first.
 */
export const publishBatch = async (
  tx: Tx,
  items: readonly Readonly<{ id: string; expectedVersion: number }>[],
  actor: Actor,
): Promise<MutationResult> => {
  const articles = await items.reduce<Promise<readonly Article[]>>(
    async (acc, item) => [...(await acc), await requireArticle(tx, item.id)],
    Promise.resolve([]),
  );
  const slugs = [...new Set(articles.map((a) => a.slug))];
  if (slugs.length > 1)
    throw apiError(
      422,
      "batch_slug_mismatch",
      "All items of a batch must be the ru and en versions of one slug.",
      { slugs },
    );
  items.forEach((item, index) => {
    const article = articles[index]!;
    if (article.version !== item.expectedVersion)
      throw apiError(409, "version_conflict", "Read the current version before publishing.", {
        id: article.id,
        version: article.version,
      });
  });
  const ordered = [...articles].sort((a, b) => (a.lang === b.lang ? 0 : a.lang === "ru" ? -1 : 1));
  const batchId = randomUUID();
  const start = Date.now();
  // Sequential on purpose: one transaction connection, and `createdAt` follows the queue order.
  const outcomes = await ordered.reduce<
    Promise<readonly Readonly<{ queued: boolean; result: Record<string, unknown> }>[]>
  >(async (accPromise, article) => {
    const acc = await accPromise;
    const latest = await requireIdle(tx, article.id);
    if (article.publishedVersion === article.version && latest?.kind !== "unpublish")
      return [
        ...acc,
        { queued: false, result: { ...articleView(article, latest), unchanged: true } },
      ];
    const job = await enqueuePublication(tx, article, actor, {
      batchId,
      createdAt: new Date(start + acc.filter((o) => o.queued).length),
      idle: true,
    });
    return [
      ...acc,
      { queued: true, result: { ...articleView(article, job), publication: publicationView(job) } },
    ];
  }, Promise.resolve([]));
  const queued = outcomes.some((o) => o.queued);
  return {
    status: queued ? 202 : 200,
    data: { batchId: queued ? batchId : null, items: outcomes.map((o) => o.result) },
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
    items: items.map((row) => publicationView(row)),
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
