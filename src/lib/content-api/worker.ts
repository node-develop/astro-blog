import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { contentApiKeys, contentArticles, contentPublications, postsMeta } from "../db/schema";
import { effectiveScopes } from "./auth";
import { apiError, isApiError } from "./errors";
import { articlePath, articleUrl, commitArticle, deleteArticle } from "./github";
import { CONTENT_LOCK, requireArticle, validateDocument } from "./service";
import { buildPointerAfterFailure, ownsCommittedFile } from "./status";
import { buildSearchVectorSql } from "../search/vector";
import { logger } from "../logger";
import { coverUrlOf, probeImageUrl } from "./cover";

export const verifyPublication = async (url: string, revision: string): Promise<boolean> => {
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return false;
  const html = await response.text();
  return (
    html.includes(`data-content-revision="${revision}"`) &&
    /<link[^>]+rel="canonical"/.test(html) &&
    /<meta[^>]+name="description"/.test(html) &&
    !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html)
  );
};

const PENDING_RETRY_MS = 15_000;
const sitemapUrl = (url: string, lang: string): URL => new URL(`/sitemap-${lang}.xml`, url);

/**
 * The inverse of `verifyPublication`: the page answers 404/410 AND the sitemap is a real sitemap
 * (an XML `<urlset>` with at least one `<loc>`) that does not list the url. An empty body, an
 * error page or a sitemap of another origin proves nothing, so it counts as not yet gone.
 */
export const verifyUnpublished = async (url: string, lang: string): Promise<boolean> => {
  const page = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (page.status !== 404 && page.status !== 410) return false;
  const sitemap = await fetch(sitemapUrl(url, lang), {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!sitemap.ok) return false;
  const xml = await sitemap.text();
  return xml.includes("<urlset") && xml.includes("<loc>") && !xml.includes(`<loc>${url}</loc>`);
};

/** One durable step per call. PostgreSQL owns the lock, including across replicas.
 * If the process dies during a GitHub call, the transaction rolls back; the next
 * attempt detects the exact immutable content already committed and resumes.
 */
export const processPublication = async () =>
  db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${CONTENT_LOCK}) as locked`,
    );
    if (!lock[0]?.locked) return { worked: false };
    // Oldest job that is due. A job waiting for its next attempt (a build still
    // deploying, a backoff after an error) must not hold up the ones behind it.
    // The advisory lock above still allows only one step at a time, and
    // content_publications_one_active_idx only one active job per article.
    const [job] = await tx
      .select()
      .from(contentPublications)
      .where(
        and(
          inArray(contentPublications.state, ["queued", "publishing"]),
          lte(contentPublications.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(asc(contentPublications.createdAt), asc(contentPublications.id))
      .limit(1);
    if (!job) return { worked: false };
    const article = await requireArticle(tx, job.articleId);
    try {
      const [key] = await tx.select().from(contentApiKeys).where(eq(contentApiKeys.id, job.keyId));
      if (!key || key.revokedAt || !effectiveScopes(key).includes("articles:publish"))
        throw apiError(
          403,
          "key_revoked",
          "The key that requested publication is revoked or no longer has publish permission.",
        );
      if (article.version !== job.version)
        throw apiError(409, "version_conflict", "Article changed after publication was queued.");
      if (job.state === "queued") {
        // TODO(cutover): an article owns its file once it was published or committed before;
        // a first commit must not overwrite a legacy file post that appeared at the same path.
        // Removed with commitArticle (docs/superpowers/plans/2026-10-03-api-only-migration.md).
        // Only a `publish` commit proves ownership; an unpublish commit removes the file.
        const own = await tx
          .select({
            id: contentPublications.id,
            kind: contentPublications.kind,
            state: contentPublications.state,
            commitSha: contentPublications.commitSha,
            createdAt: contentPublications.createdAt,
          })
          .from(contentPublications)
          .where(eq(contentPublications.articleId, article.id));
        const ownership = {
          overwrite: article.publishedVersion !== null || ownsCommittedFile(own),
          // A commit accepted by GitHub whose response was lost leaves no commit_sha, but the file
          // carries the publication id as apiRevision.
          ownedRevisions: own.filter((p) => p.kind === "publish").map((p) => p.id),
        };
        const path = articlePath(article.slug, article.lang);
        // An https cover must answer as an image before the page goes live: afterwards a dead
        // cover would already be public. A `/uploads/` cover was checked when the job was queued.
        const coverUrl = coverUrlOf(article.document.cover);
        if (
          job.kind === "publish" &&
          coverUrl?.startsWith("https://") &&
          !(await probeImageUrl(coverUrl).catch((error: unknown) => {
            logger.warn(
              { url: coverUrl, errorType: error instanceof Error ? error.name : "unknown" },
              "cover probe failed",
            );
            return false;
          }))
        )
          throw apiError(
            503,
            "cover_unreachable",
            "The cover URL does not answer as an image; fix it or retry publication later.",
            { url: coverUrl },
          );
        const sha =
          job.kind === "unpublish"
            ? await deleteArticle(path, ownership)
            : await (async () => {
                // Pre-create visible metadata for the build and runtime lists. No page is
                // public until GitHub's build includes the non-draft Markdown document.
                await tx
                  .insert(postsMeta)
                  .values({ slug: article.slug, order: 2_000_000_000, hiddenFromList: false })
                  .onConflictDoNothing({ target: postsMeta.slug });
                return commitArticle(path, job.content, ownership);
              })();
        await tx
          .update(contentPublications)
          .set({
            state: "publishing",
            commitSha: sha,
            error: null,
            updatedAt: new Date(),
            nextAttemptAt: new Date(Date.now() + PENDING_RETRY_MS),
          })
          .where(eq(contentPublications.id, job.id));
        // Dispatch moves the desired build state (docs: spec "Export (промпт 1.8)"): a publish
        // points the article at its content, an unpublish takes it out of the export. Same
        // transaction as the state change, so export never sees one without the other.
        await tx
          .update(contentArticles)
          .set({ buildPublicationId: job.kind === "unpublish" ? null : job.id })
          .where(eq(contentArticles.id, article.id));
      } else if (job.kind === "unpublish") {
        const url = articleUrl(article.slug, article.lang);
        if (await verifyUnpublished(url, article.lang)) {
          // Back to a draft: the published pointers go, `firstPublishedAt` stays so a later
          // publication keeps its pubDate. `posts_meta` is shared by both languages and keeps
          // order and pinned for a republication. Hooks stay pending: IndexNow pings the removed
          // url (a gone page is worth telling the engines about); social drafts are not created
          // for an unpublication (see hooks.ts).
          await tx
            .update(contentArticles)
            .set({
              unpublishedAt: new Date(),
              publishedVersion: null,
              publishedContent: null,
              buildPublicationId: null,
            })
            .where(eq(contentArticles.id, article.id));
          await tx
            .update(contentPublications)
            .set({
              state: "published",
              error: null,
              updatedAt: new Date(),
            })
            .where(eq(contentPublications.id, job.id));
        } else if (Date.now() - job.updatedAt.getTime() > 30 * 60_000) {
          throw apiError(
            504,
            "deployment_timeout",
            "The page or its sitemap entry did not disappear within 30 minutes. Inspect CI/Dokploy and retry unpublishing.",
          );
        } else {
          // Page still live or sitemap still lists it: pending, not an error.
          await tx
            .update(contentPublications)
            .set({ nextAttemptAt: new Date(Date.now() + PENDING_RETRY_MS) })
            .where(eq(contentPublications.id, job.id));
        }
      } else {
        const url = articleUrl(article.slug, article.lang);
        const live = await verifyPublication(url, job.id);
        if (live) {
          const { assets } = await validateDocument(article.document, tx);
          const reachable = await Promise.all(
            assets.map(async (asset) => {
              const response = await fetch(asset.url, {
                method: "HEAD",
                redirect: "error",
                signal: AbortSignal.timeout(10_000),
              });
              return (
                response.ok &&
                response.headers.get("content-type")?.split(";")[0] === asset.mimeType
              );
            }),
          );
          if (reachable.some((ok) => !ok))
            throw apiError(
              503,
              "images_pending",
              "Referenced images are not publicly readable yet.",
            );
          // Check the discovery surface as well; hidden metadata must not count as success.
          const sitemap = sitemapUrl(url, article.lang);
          const response = await fetch(sitemap, {
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
            cache: "no-store",
          });
          if (!response.ok || !(await response.text()).includes(`<loc>${url}</loc>`))
            throw apiError(
              503,
              "sitemap_pending",
              "Article is live but not yet present in its sitemap.",
            );
          await tx
            .update(contentArticles)
            .set({
              publishedContent: job.content,
              publishedVersion: job.version,
              unpublishedAt: null,
              firstPublishedAt: article.firstPublishedAt ?? job.createdAt,
              // Already set at dispatch; repeated so a job that was in flight before the pointer
              // existed still ends up pointing at what it published.
              buildPublicationId: job.id,
            })
            .where(eq(contentArticles.id, article.id));
          // One vector per language: the other language's column is left alone.
          const vector = buildSearchVectorSql({
            title: article.document.title,
            tags: article.document.tags,
            body: article.document.body,
          }) as unknown as string;
          await tx
            .update(postsMeta)
            .set(article.lang === "en" ? { searchVectorEn: vector } : { searchVector: vector })
            .where(eq(postsMeta.slug, article.slug));
          await tx
            .update(contentPublications)
            .set({ state: "published", error: null, updatedAt: new Date() })
            .where(eq(contentPublications.id, job.id));
        } else if (Date.now() - job.updatedAt.getTime() > 30 * 60_000) {
          throw apiError(
            504,
            "deployment_timeout",
            "The requested version did not appear within 30 minutes. Inspect CI/Dokploy and retry publication.",
          );
        } else {
          await tx
            .update(contentPublications)
            .set({ nextAttemptAt: new Date(Date.now() + 15_000) })
            .where(eq(contentPublications.id, job.id));
        }
      }
      return { worked: true, publicationId: job.id };
    } catch (error) {
      const code = isApiError(error) ? error.code : "upstream_unavailable";
      const message = isApiError(error)
        ? error.message
        : "GitHub or the public site is unavailable. Retry publication after checking service health.";
      const permanent = isApiError(error) && [403, 409, 504].includes(error.status);
      const exhausted = job.attempts >= 4;
      if (permanent || exhausted) {
        // Every road to `failed` rolls the desired build state back to what is really published.
        const events = await tx
          .select({
            id: contentPublications.id,
            kind: contentPublications.kind,
            state: contentPublications.state,
            createdAt: contentPublications.createdAt,
          })
          .from(contentPublications)
          .where(eq(contentPublications.articleId, job.articleId));
        await tx
          .update(contentArticles)
          .set({ buildPublicationId: buildPointerAfterFailure(events, job.id) })
          .where(eq(contentArticles.id, job.articleId));
      }
      await tx
        .update(contentPublications)
        .set({
          state: permanent || exhausted ? "failed" : job.state,
          ...(permanent || exhausted ? { updatedAt: new Date() } : {}),
          error: { code, message },
          attempts: job.attempts + 1,
          nextAttemptAt: new Date(Date.now() + Math.min(300_000, 15_000 * 2 ** job.attempts)),
        })
        .where(eq(contentPublications.id, job.id));
      return { worked: true, publicationId: job.id, error: code };
    }
  });
