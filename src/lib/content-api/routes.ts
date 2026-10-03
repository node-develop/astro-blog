import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getMetaBySlug } from "../db/repo/posts-meta";
import { db } from "../db";
import { contentPublications } from "../db/schema";
import { authorize, equalSecret, requireScope, type Principal } from "./auth";
import {
  createArticleSchema,
  listArticlesQuerySchema,
  listMediaQuerySchema,
  listPublicationsQuerySchema,
  publishArticleSchema,
  slugSchema,
  updateArticleSchema,
  type ApiScope,
} from "./contract";
import { apiError } from "./errors";
import { articleUrl } from "./github";
import { workerHeartbeat, workerSecretFromEnv } from "./heartbeat";
import { handleApi, idempotencyKey, jsonResponse, readBytes, readJson } from "./http";
import { MAX_IMAGE_BYTES, uploadImage } from "./media";
import { openApiDocument } from "./openapi";
import {
  articleView,
  articlesBySlug,
  createArticle,
  enqueuePublication,
  getVersion,
  listArticles,
  listMedia,
  listPublications,
  listVersions,
  mutateOnce,
  publicationView,
  requireArticle,
  updateArticle,
  validateDocument,
  type MutationResult,
  type Tx,
} from "./service";
import { processPublication } from "./worker";

/** Pure routing: `:name` captures one non-empty segment; the first match in array order wins. */
export const matchRoute = <R extends Readonly<{ method: string; pattern: string }>>(
  routes: readonly R[],
  method: string,
  path: string,
): Readonly<{ route: R; params: Readonly<Record<string, string>> }> | null => {
  const segments = (path.endsWith("/") ? path.slice(0, -1) : path).split("/");
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.pattern.split("/");
    if (pattern.length !== segments.length) continue;
    const matches = pattern.every((part, index) =>
      part.startsWith(":") ? (segments[index] ?? "") !== "" : part === segments[index],
    );
    if (!matches) continue;
    const params = Object.fromEntries(
      pattern.flatMap((part, index) =>
        part.startsWith(":") ? [[part.slice(1), segments[index] ?? ""] as const] : [],
      ),
    );
    return { route, params };
  }
  return null;
};

type PublicCtx = Readonly<{
  request: Request;
  /** The path exactly as Astro passed it (no normalising: stored request digests contain it). */
  path: string;
  params: Readonly<Record<string, string>>;
}>;
type Ctx = PublicCtx & Readonly<{ principal: Principal }>;
type Once = (
  input: unknown,
  operation: (tx: Tx) => Promise<MutationResult>,
) => Promise<MutationResult>;

type Common = Readonly<{ method: string; pattern: string; sessionOnly?: true }>;
export type Route = Common &
  (
    | Readonly<{ scope: null; idempotent: false; handler: (ctx: PublicCtx) => Promise<Response> }>
    | Readonly<{
        scope: ApiScope | "any";
        idempotent: false;
        handler: (ctx: Ctx) => Promise<Response>;
      }>
    | Readonly<{
        scope: ApiScope | "any";
        idempotent: true;
        handler: (ctx: Ctx & Readonly<{ once: Once }>) => Promise<Response>;
      }>
  );

export type DispatchContext = Readonly<{
  request: Request;
  params: Readonly<Record<string, string | undefined>>;
  locals?: Partial<App.Locals> | undefined;
}>;

/** Sessions share one key_id, so the idempotency namespace carries the user: two admins never replay each other. */
const namespaced = (principal: Principal, key: string): string =>
  principal.kind === "session" ? `${principal.userId}:${key}` : key;

export const createDispatcher =
  (routes: readonly Route[]) =>
  ({ request, params, locals }: DispatchContext): Promise<Response> =>
    handleApi(async () => {
      const path = params.path ?? "";
      const matched = matchRoute(routes, request.method, path);
      if (!matched) throw apiError(404, "not_found", "Unknown content API route or method.");
      const { route } = matched;
      const base = { request, path, params: matched.params };
      if (route.scope === null) return route.handler(base);
      const principal = await authorize(request, locals, route.scope);
      if (route.sessionOnly && principal.kind !== "session")
        throw apiError(
          403,
          "key_cannot_manage_keys",
          "API keys can only be managed from an admin session.",
        );
      const ctx = { ...base, principal };
      if (!route.idempotent) return route.handler(ctx);
      // Read lazily: a bad body still gets its 415/422 before the 400 for a missing key.
      const once: Once = (input, operation) =>
        mutateOnce(
          principal.keyId,
          namespaced(principal, idempotencyKey(request)),
          { method: request.method, path, input },
          operation,
        );
      return route.handler({ ...ctx, once });
    });

const articleId = (params: Readonly<Record<string, string>>): string => z.uuid().parse(params.id);
const queryOf = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams);
const versionNumber = (params: Readonly<Record<string, string>>): number =>
  Number(
    z
      .string()
      .regex(/^[1-9]\d{0,8}$/)
      .parse(params.n),
  );

export const routes: readonly Route[] = [
  {
    // Astro serves openapi.json.ts ahead of the rest route; this entry answers only when ALL is called directly.
    method: "GET",
    pattern: "openapi.json",
    scope: null,
    idempotent: false,
    handler: async () => jsonResponse(openApiDocument),
  },
  {
    method: "POST",
    pattern: "_worker",
    scope: null,
    idempotent: false,
    handler: async ({ request }) => {
      const secret = workerSecretFromEnv();
      if (!secret) throw apiError(503, "worker_not_configured", "Publication worker is disabled.");
      if (!equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
        throw apiError(401, "unauthorized", "Worker credentials required.");
      // Tick before the step: a slow or failing publication is still a live worker.
      workerHeartbeat.beat();
      return jsonResponse(await processPublication());
    },
  },
  {
    method: "GET",
    pattern: "whoami",
    scope: "any",
    idempotent: false,
    handler: async ({ principal }) =>
      jsonResponse({ kind: principal.kind, keyName: principal.keyName, scopes: principal.scopes }),
  },
  {
    method: "POST",
    pattern: "media",
    scope: "media:write",
    idempotent: false,
    handler: async ({ request, principal }) => {
      const mime = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      const asset = await uploadImage(
        await readBytes(request, MAX_IMAGE_BYTES),
        mime,
        principal.keyId,
      );
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
    },
  },
  {
    method: "POST",
    pattern: "articles/validate",
    scope: "articles:write",
    idempotent: false,
    handler: async ({ request }) => {
      const input = createArticleSchema.parse(await readJson(request));
      const { warnings } = await validateDocument(input.article);
      return jsonResponse({ valid: true, warnings });
    },
  },
  {
    method: "POST",
    pattern: "articles",
    scope: "articles:write",
    idempotent: true,
    handler: async ({ request, principal, once }) => {
      const input = createArticleSchema.parse(await readJson(request));
      if (input.mode === "publish") requireScope(principal, "articles:publish");
      const result = await once(input, (tx) =>
        createArticle(tx, input.article, input.mode, principal.keyId),
      );
      return jsonResponse(result.data, result.status, {
        location: `/api/v1/articles/${result.data.id}/`,
      });
    },
  },
  {
    method: "GET",
    pattern: "articles",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ request }) =>
      jsonResponse(await listArticles(db, listArticlesQuerySchema.parse(queryOf(request)))),
  },
  {
    // Before articles/:id/versions: both have three segments and the first match wins.
    method: "GET",
    pattern: "articles/by-slug/:slug",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) =>
      jsonResponse(await articlesBySlug(db, slugSchema.parse(params.slug))),
  },
  {
    method: "GET",
    pattern: "articles/:id/versions",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) => jsonResponse(await listVersions(db, articleId(params))),
  },
  {
    method: "GET",
    pattern: "articles/:id/versions/:n",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) =>
      jsonResponse(await getVersion(db, articleId(params), versionNumber(params))),
  },
  {
    method: "GET",
    pattern: "articles/:id",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) => {
      const id = articleId(params);
      const article = await requireArticle(db, id);
      const [publication] = await db
        .select()
        .from(contentPublications)
        .where(eq(contentPublications.articleId, id))
        .orderBy(desc(contentPublications.createdAt))
        .limit(1);
      return jsonResponse({
        ...articleView(article),
        publication: publication ? publicationView(publication) : null,
      });
    },
  },
  {
    method: "PUT",
    pattern: "articles/:id",
    scope: "articles:write",
    idempotent: true,
    handler: async ({ request, params, principal, once }) => {
      const id = articleId(params);
      const input = updateArticleSchema.parse(await readJson(request));
      if (input.mode === "publish") requireScope(principal, "articles:publish");
      const result = await once(input, (tx) => updateArticle(tx, id, input, principal.keyId));
      return jsonResponse(result.data, result.status);
    },
  },
  {
    method: "POST",
    pattern: "articles/:id/publish",
    scope: "articles:publish",
    idempotent: true,
    handler: async ({ request, params, principal, once }) => {
      const id = articleId(params);
      const input = publishArticleSchema.parse(await readJson(request));
      const result = await once(input, async (tx) => {
        const article = await requireArticle(tx, id);
        if (article.version !== input.expectedVersion)
          throw apiError(409, "version_conflict", "Read the current version before publishing.");
        if (article.publishedVersion === article.version)
          return { status: 200, data: { ...articleView(article), unchanged: true } };
        const publication = await enqueuePublication(tx, article, principal.keyId);
        return {
          status: 202,
          data: { ...articleView(article), publication: publicationView(publication) },
        };
      });
      return jsonResponse(result.data, result.status);
    },
  },
  {
    method: "GET",
    pattern: "publications",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ request }) =>
      jsonResponse(await listPublications(db, listPublicationsQuerySchema.parse(queryOf(request)))),
  },
  {
    // Reading the media list needs articles:read, not media:write: an agent needs assetIds to
    // reference images, and a read-only key must not gain the right to upload.
    method: "GET",
    pattern: "media",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ request }) =>
      jsonResponse(await listMedia(db, listMediaQuerySchema.parse(queryOf(request)))),
  },
  {
    method: "GET",
    pattern: "posts-meta/:slug",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) => {
      const meta = await getMetaBySlug(slugSchema.parse(params.slug));
      if (!meta) throw apiError(404, "not_found", "Post metadata not found.");
      return jsonResponse({
        slug: meta.slug,
        order: meta.order,
        pinned: meta.pinned,
        hiddenFromList: meta.hiddenFromList,
        updatedAt: meta.updatedAt.toISOString(),
      });
    },
  },
  {
    method: "GET",
    pattern: "publications/:id",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) => {
      const id = articleId(params);
      const [job] = await db
        .select()
        .from(contentPublications)
        .where(eq(contentPublications.id, id));
      if (!job) throw apiError(404, "not_found", "Publication not found.");
      const article = await requireArticle(db, job.articleId);
      return jsonResponse({ ...publicationView(job), url: articleUrl(article.slug, article.lang) });
    },
  },
];
