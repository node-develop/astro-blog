import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as yaml from "~/lib/yaml";
import { resolve } from "node:path";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, type Database } from "../db";
import {
  contentArticles,
  contentAssets,
  contentApiRequests,
  contentPublications,
  postRevisions,
} from "../db/schema";
import type { ArticleDocument } from "./contract";
import { hash } from "./auth";
import { apiError } from "./errors";
import { articlePath, articleUrl, readRemoteArticle } from "./github";
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
export const publicationView = (job: Publication) => ({
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
export const latestManualRevision = async (tx: Tx | Database, slug: string) => {
  const [revision] = await tx
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.slug, slug))
    .orderBy(desc(postRevisions.id))
    .limit(1);
  return revision ?? null;
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
  const prefix = document.lang === "en" ? "en/" : "";
  const isPublishedFile = (slug: string): boolean => {
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
  for (const slug of document.relatedSlugs) {
    const [related] = await tx
      .select()
      .from(contentArticles)
      .where(and(eq(contentArticles.slug, slug), eq(contentArticles.lang, document.lang)));
    if (slug === document.slug || (!related?.publishedVersion && !isPublishedFile(slug)))
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
  const manual = await latestManualRevision(tx, article.slug);
  if ((manual?.id ?? 0) !== article.baseManualRevisionId)
    throw apiError(
      409,
      "manual_edit_conflict",
      "The admin has newer edits. Read and reconcile them before publishing.",
    );
  const { assets } = await validateDocument(article.document, tx);
  const id = randomUUID();
  const now = new Date();
  const [previous] = await tx
    .select()
    .from(contentPublications)
    .where(eq(contentPublications.articleId, article.id))
    .orderBy(desc(contentPublications.createdAt))
    .limit(1);
  // A retry after a failed deployment writes a fresh revision marker, triggering
  // a fresh build. Only accept the exact prior snapshot as the remote baseline.
  const baseRemoteHash =
    previous?.state === "failed" && previous.commitSha && previous.version === article.version
      ? hash(previous.content)
      : article.baseRemoteHash;
  const content = serializeArticle(
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
      baseRemoteHash,
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
  if (existsSync(resolve(path)) || existsSync(resolve(`${path}x`)))
    throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
  const { warnings } = await validateDocument(document, tx);
  const manual = await latestManualRevision(tx, document.slug);
  const [article] = await tx
    .insert(contentArticles)
    .values({
      document,
      externalId: document.externalId,
      slug: document.slug,
      lang: document.lang,
      keyId,
      baseManualRevisionId: manual?.id ?? 0,
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
    acknowledgedManualRevisionId: number;
    expectedRemoteHash?: string | null | undefined;
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
  const manual = await latestManualRevision(tx, current.slug);
  if (
    (manual?.id ?? 0) !== current.baseManualRevisionId &&
    input.acknowledgedManualRevisionId !== manual?.id
  )
    throw apiError(
      409,
      "manual_edit_conflict",
      "Read the manual revision and explicitly acknowledge its ID after merging the edits.",
      { manualRevisionId: manual?.id },
    );
  const { warnings } = await validateDocument(input.article, tx);
  let baseRemoteHash = current.baseRemoteHash;
  if (input.expectedRemoteHash !== undefined) {
    const remote = await readRemoteArticle(articlePath(current.slug, current.lang));
    if (remote.hash !== input.expectedRemoteHash)
      throw apiError(409, "remote_edit_conflict", "Remote content changed since it was read.");
    baseRemoteHash = remote.hash;
  }
  const [article] = await tx
    .update(contentArticles)
    .set({
      document: input.article,
      version: current.version + 1,
      updatedAt: new Date(),
      baseManualRevisionId: manual?.id ?? 0,
      baseRemoteHash,
    })
    .where(eq(contentArticles.id, id))
    .returning();
  const job = input.mode === "publish" ? await enqueuePublication(tx, article!, keyId) : null;
  return {
    status: job ? 202 : 200,
    data: { ...articleView(article!), publication: job && publicationView(job), warnings },
  };
};
