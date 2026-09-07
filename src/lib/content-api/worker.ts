import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { contentApiKeys, contentArticles, contentPublications, postsMeta } from "../db/schema";
import { hash } from "./auth";
import { apiError, isApiError } from "./errors";
import { articlePath, articleUrl, commitArticle } from "./github";
import { CONTENT_LOCK, latestManualRevision, requireArticle, validateDocument } from "./service";
import { buildSearchVectorSql } from "../search/vector";

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
    // Serialise whole deployments: a newer job must not replace an unverified build.
    const [job] = await tx
      .select()
      .from(contentPublications)
      .where(inArray(contentPublications.state, ["queued", "publishing"]))
      .orderBy(asc(contentPublications.createdAt), asc(contentPublications.id))
      .limit(1);
    if (!job || job.nextAttemptAt > new Date()) return { worked: false };
    const article = await requireArticle(tx, job.articleId);
    try {
      const [key] = await tx.select().from(contentApiKeys).where(eq(contentApiKeys.id, job.keyId));
      if (!key || key.revokedAt || !key.scopes.includes("articles:publish"))
        throw apiError(
          403,
          "key_revoked",
          "The key that requested publication is revoked or no longer has publish permission.",
        );
      if (article.version !== job.version)
        throw apiError(409, "version_conflict", "Article changed after publication was queued.");
      const manual = await latestManualRevision(tx, article.slug);
      if ((manual?.id ?? 0) !== article.baseManualRevisionId)
        throw apiError(409, "manual_edit_conflict", "Newer manual edits exist.");
      if (job.state === "queued") {
        // Pre-create visible metadata for the build and runtime lists. No page is
        // public until GitHub's build includes the non-draft Markdown document.
        await tx
          .insert(postsMeta)
          .values({ slug: article.slug, order: 2_000_000_000, hiddenFromList: false })
          .onConflictDoNothing({ target: postsMeta.slug });
        const sha = await commitArticle(
          articlePath(article.slug, article.lang),
          job.content,
          job.baseRemoteHash,
        );
        await tx
          .update(contentPublications)
          .set({
            state: "publishing",
            commitSha: sha,
            error: null,
            updatedAt: new Date(),
            nextAttemptAt: new Date(Date.now() + 15_000),
          })
          .where(eq(contentPublications.id, job.id));
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
          const sitemap = new URL(`/sitemap-${article.lang}.xml`, url);
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
              baseRemoteHash: hash(job.content),
              firstPublishedAt: article.firstPublishedAt ?? job.createdAt,
            })
            .where(eq(contentArticles.id, article.id));
          await tx
            .update(postsMeta)
            .set({
              searchVector: buildSearchVectorSql({
                title: article.document.title,
                tags: article.document.tags,
                body: article.document.body,
              }) as unknown as string,
            })
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
