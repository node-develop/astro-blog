import type { APIRoute } from "astro";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { contentPublications } from "~/lib/db/schema";
import { authenticate, equalSecret } from "~/lib/content-api/auth";
import {
  createArticleSchema,
  publishArticleSchema,
  updateArticleSchema,
} from "~/lib/content-api/contract";
import { apiError } from "~/lib/content-api/errors";
import { articlePath, articleUrl, readRemoteArticle } from "~/lib/content-api/github";
import {
  handleApi,
  idempotencyKey,
  jsonResponse,
  readBytes,
  readJson,
} from "~/lib/content-api/http";
import { MAX_IMAGE_BYTES, uploadImage } from "~/lib/content-api/media";
import {
  articleView,
  createArticle,
  enqueuePublication,
  latestManualRevision,
  mutateOnce,
  publicationView,
  requireArticle,
  updateArticle,
  validateDocument,
} from "~/lib/content-api/service";
import { processPublication } from "~/lib/content-api/worker";
import { openApiDocument } from "~/lib/content-api/openapi";

export const prerender = false;
export const ALL: APIRoute = ({ request, params }) =>
  handleApi(async () => {
    const path = params.path ?? "";
    const method = request.method;
    if (path === "openapi.json" && method === "GET") return jsonResponse(openApiDocument);
    if (path === "_worker" && method === "POST") {
      const secret = process.env.CONTENT_WORKER_SECRET;
      if (!secret || secret.length < 32)
        throw apiError(503, "worker_not_configured", "Publication worker is disabled.");
      if (!equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
        throw apiError(401, "unauthorized", "Worker credentials required.");
      return jsonResponse(await processPublication());
    }
    if (path === "media" && method === "POST") {
      const key = await authenticate(request, "media:write");
      const mime = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      const asset = await uploadImage(await readBytes(request, MAX_IMAGE_BYTES), mime, key.id);
      return jsonResponse(
        {
          asset: {
            id: asset.id,
            url: asset.url,
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
          },
        },
        201,
      );
    }
    if (path === "articles/validate" && method === "POST") {
      await authenticate(request, "articles:write");
      const input = createArticleSchema.parse(await readJson(request));
      const { warnings } = await validateDocument(input.article);
      return jsonResponse({ valid: true, warnings });
    }
    if (path === "articles" && method === "POST") {
      const key = await authenticate(request, "articles:write");
      const input = createArticleSchema.parse(await readJson(request));
      if (input.mode === "publish" && !key.scopes.includes("articles:publish"))
        throw apiError(403, "forbidden", "Required scope: articles:publish");
      const result = await mutateOnce(
        key.id,
        idempotencyKey(request),
        { method, path, input },
        (tx) => createArticle(tx, input.article, input.mode, key.id),
      );
      return jsonResponse(result.data, result.status, {
        location: `/api/v1/articles/${result.data.id}/`,
      });
    }
    const articleMatch = /^articles\/([^/]+)(\/publish)?$/.exec(path);
    if (articleMatch && ["GET", "PUT", "POST"].includes(method)) {
      const id = z.uuid().parse(articleMatch[1]);
      if (!articleMatch[2] && method === "GET") {
        await authenticate(request, "articles:read");
        const article = await requireArticle(db, id);
        const [publication] = await db
          .select()
          .from(contentPublications)
          .where(eq(contentPublications.articleId, id))
          .orderBy(desc(contentPublications.createdAt))
          .limit(1);
        const manualRevision = await latestManualRevision(db, article.slug);
        let remote: { available: boolean; content?: string | null; hash?: string | null } = {
          available: false,
        };
        if (process.env.GITHUB_PAT) {
          try {
            remote = {
              available: true,
              ...(await readRemoteArticle(articlePath(article.slug, article.lang))),
            };
          } catch {
            /* Local document stays readable during a GitHub outage. */
          }
        }
        return jsonResponse({
          ...articleView(article),
          publication: publication ? publicationView(publication) : null,
          manualRevision,
          manualEditsPending: (manualRevision?.id ?? 0) !== article.baseManualRevisionId,
          remote,
        });
      }
      if (!articleMatch[2] && method === "PUT") {
        const key = await authenticate(request, "articles:write");
        const input = updateArticleSchema.parse(await readJson(request));
        if (input.mode === "publish" && !key.scopes.includes("articles:publish"))
          throw apiError(403, "forbidden", "Required scope: articles:publish");
        const result = await mutateOnce(
          key.id,
          idempotencyKey(request),
          { method, path, input },
          (tx) => updateArticle(tx, id, input, key.id),
        );
        return jsonResponse(result.data, result.status);
      }
      if (articleMatch[2] && method === "POST") {
        const key = await authenticate(request, "articles:publish");
        const input = publishArticleSchema.parse(await readJson(request));
        const result = await mutateOnce(
          key.id,
          idempotencyKey(request),
          { method, path, input },
          async (tx) => {
            const article = await requireArticle(tx, id);
            if (article.version !== input.expectedVersion)
              throw apiError(
                409,
                "version_conflict",
                "Read the current version before publishing.",
              );
            if (article.publishedVersion === article.version)
              return { status: 200, data: { ...articleView(article), unchanged: true } };
            const publication = await enqueuePublication(tx, article, key.id);
            return {
              status: 202,
              data: { ...articleView(article), publication: publicationView(publication) },
            };
          },
        );
        return jsonResponse(result.data, result.status);
      }
    }
    const publicationMatch = /^publications\/([^/]+)$/.exec(path);
    if (publicationMatch && method === "GET") {
      await authenticate(request, "articles:read");
      const id = z.uuid().parse(publicationMatch[1]);
      const [job] = await db
        .select()
        .from(contentPublications)
        .where(eq(contentPublications.id, id));
      if (!job) throw apiError(404, "not_found", "Publication not found.");
      const article = await requireArticle(db, job.articleId);
      return jsonResponse({ ...publicationView(job), url: articleUrl(article.slug, article.lang) });
    }
    throw apiError(404, "not_found", "Unknown content API route or method.");
  });
