import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import {
  getMetaBySlug,
  listAllMeta,
  listMetaBySlugs,
  reorderMeta,
  setMetaFlags,
} from "../db/repo/posts-meta";
import type { PostMeta } from "../db/schema";
import { db } from "../db";
import { contentPublications } from "../db/schema";
import {
  actorOf,
  authorize,
  defaultAgent,
  equalSecret,
  requireScope,
  type Principal,
} from "./auth";
import {
  completeArticle,
  createArticleSchema,
  createKeySchema,
  listArticlesQuerySchema,
  listMediaQuerySchema,
  listPublicationsQuerySchema,
  listSocialQuerySchema,
  postMetaOrderSchema,
  postMetaPatchSchema,
  publishArticleSchema,
  publishBatchSchema,
  slugSchema,
  socialDraftUpdateSchema,
  socialGenerateSchema,
  socialPublishSchema,
  socialSkipSchema,
  translateArticleSchema,
  updateArticleSchema,
  type ApiScope,
} from "./contract";
import { apiError } from "./errors";
import { articleUrl } from "./github";
import { workerHeartbeat, workerSecretFromEnv } from "./heartbeat";
import {
  handleApi,
  idempotencyKey,
  ifMatchVersion,
  jsonResponse,
  readBytes,
  readJson,
} from "./http";
import { createKey, listKeys, revokeKey } from "./keys";
import { MAX_IMAGE_BYTES, uploadImage } from "./media";
import { kickoffSocial, publishDraft, recheckDraft, saveDraft, skipDraft } from "../social/service";
import { openApiDocument } from "./openapi";
import {
  articleView,
  articlesBySlug,
  createArticle,
  deleteDraft,
  enqueuePublication,
  enqueueUnpublication,
  findReplay,
  getVersion,
  listArticles,
  listMedia,
  listPublications,
  listSocialDrafts,
  listVersions,
  mutateOnce,
  publicationView,
  publishBatch,
  requireArticle,
  requireIdle,
  restoreVersion,
  socialDraftView,
  updateArticle,
  validateDocument,
  withContentLock,
  type MutationResult,
  type Tx,
} from "./service";
import { TRANSLATION_DEADLINE_MS, runTranslation } from "./translate-article";
import { runPublicationHooks } from "./hooks";
import { logger } from "../logger";
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

/** The stored response for this Idempotency-Key and request, or null; read without the lock. */
type Replay = (input: unknown) => Promise<MutationResult | null>;

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
        handler: (ctx: Ctx & Readonly<{ once: Once; replay: Replay }>) => Promise<Response>;
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
      const replay: Replay = (input) =>
        findReplay(db, principal.keyId, namespaced(principal, idempotencyKey(request)), {
          method: request.method,
          path,
          input,
        });
      return route.handler({ ...ctx, once, replay });
    });

const postMetaView = (meta: PostMeta) => ({
  slug: meta.slug,
  order: meta.order,
  pinned: meta.pinned,
  hiddenFromList: meta.hiddenFromList,
  updatedAt: meta.updatedAt.toISOString(),
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
      const step = await processPublication();
      // Hooks run after the step has committed, so a publication that went live just now gets its
      // hooks in this very call. `hooks` is absent when none was waiting (the smoke test and old
      // clients see `{ worked: false }` unchanged). A hook failure never fails the call.
      const hooks = await runPublicationHooks().catch((error: unknown) => {
        logger.error({ mod: "hooks", err: error }, "worker hooks crashed");
        return null;
      });
      return jsonResponse(hooks ? { ...step, hooks } : step);
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
    handler: async ({ request, principal }) => {
      const input = createArticleSchema.parse(await readJson(request));
      // No lock and no lookup here: a twin's externalId is only known to a real create.
      const document = completeArticle(input.article, {
        externalId: input.article.slug,
        agent: defaultAgent(principal),
      });
      const { warnings } = await validateDocument(document);
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
        createArticle(tx, input.article, input.mode, actorOf(principal), defaultAgent(principal)),
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
        .orderBy(desc(contentPublications.createdAt), desc(contentPublications.id))
        .limit(1);
      // The ETag is the article version, for If-Match only: `status` and `publication` change
      // without a version bump, so it is not a cache validator and If-None-Match is not supported.
      return jsonResponse(
        {
          ...articleView(article, publication ?? null),
          publication: publication ? publicationView(publication) : null,
        },
        200,
        { etag: `"${article.version}"` },
      );
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
      const result = await once(input, (tx) =>
        updateArticle(tx, id, input, actorOf(principal), defaultAgent(principal)),
      );
      return jsonResponse(result.data, result.status);
    },
  },
  {
    // Not a plain `once`: the model call takes tens of seconds and must not run under the content
    // lock. A stored response is replayed first; the write is the only part under `once`. Two
    // concurrent retries with one key may both pay; only one is written, the other replays.
    method: "POST",
    pattern: "articles/:id/translate",
    scope: "articles:write",
    idempotent: true,
    handler: async ({ request, params, principal, once, replay }) => {
      const id = articleId(params);
      const input = translateArticleSchema.parse(await readJson(request));
      const stored = await replay(input);
      if (stored) return jsonResponse(stored.data, stored.status);
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey)
        throw apiError(
          503,
          "translation_not_configured",
          "Translation is disabled: ANTHROPIC_API_KEY is not set.",
        );
      const result = await runTranslation(
        {
          apiKey,
          actor: actorOf(principal),
          agent: defaultAgent(principal),
          once: (operation) => once(input, operation),
          signal: AbortSignal.timeout(TRANSLATION_DEADLINE_MS),
        },
        id,
        input,
      );
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
        const latest = await requireIdle(tx, id);
        // An unpublish that was the last word (even a failed one whose commit landed) is not
        // "already published": publishing again restores the page.
        if (article.publishedVersion === article.version && latest?.kind !== "unpublish")
          return { status: 200, data: { ...articleView(article, latest), unchanged: true } };
        const publication = await enqueuePublication(tx, article, actorOf(principal), {
          idle: true,
        });
        return {
          status: 202,
          data: { ...articleView(article, publication), publication: publicationView(publication) },
        };
      });
      return jsonResponse(result.data, result.status);
    },
  },
  {
    method: "POST",
    pattern: "articles/:id/versions/:n/restore",
    scope: "articles:write",
    idempotent: true,
    handler: async ({ request, params, principal, once }) => {
      const id = articleId(params);
      const n = versionNumber(params);
      const input = publishArticleSchema.parse(await readJson(request));
      const result = await once(input, (tx) =>
        restoreVersion(tx, id, n, input.expectedVersion, actorOf(principal)),
      );
      return jsonResponse(result.data, result.status);
    },
  },
  {
    // Not idempotent: a repeat gets 404 (or 412) instead of a replay. The lock serialises it with
    // writers and the worker.
    method: "DELETE",
    pattern: "articles/:id",
    scope: "articles:write",
    idempotent: false,
    handler: async ({ request, params }) => {
      const id = articleId(params);
      const ifMatch = ifMatchVersion(request);
      const result = await withContentLock((tx) => deleteDraft(tx, id, ifMatch));
      return jsonResponse(result.data, result.status);
    },
  },
  {
    method: "POST",
    pattern: "articles/:id/unpublish",
    scope: "articles:publish",
    idempotent: true,
    handler: async ({ request, params, principal, once }) => {
      const id = articleId(params);
      const input = publishArticleSchema.parse(await readJson(request));
      const result = await once(input, async (tx) =>
        enqueueUnpublication(
          tx,
          await requireArticle(tx, id),
          input.expectedVersion,
          actorOf(principal),
        ),
      );
      return jsonResponse(result.data, result.status);
    },
  },
  {
    method: "POST",
    pattern: "publish",
    scope: "articles:publish",
    idempotent: true,
    handler: async ({ request, principal, once }) => {
      const input = publishBatchSchema.parse(await readJson(request));
      const result = await once(input, (tx) => publishBatch(tx, input.items, actorOf(principal)));
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
    // The source of the complete list that PUT posts-meta/order demands.
    method: "GET",
    pattern: "posts-meta",
    scope: "articles:read",
    idempotent: false,
    handler: async () =>
      jsonResponse({ items: (await listAllMeta()).map((row) => postMetaView(row)) }),
  },
  {
    method: "GET",
    pattern: "posts-meta/:slug",
    scope: "articles:read",
    idempotent: false,
    handler: async ({ params }) => {
      const meta = await getMetaBySlug(slugSchema.parse(params.slug));
      if (!meta) throw apiError(404, "not_found", "Post metadata not found.");
      return jsonResponse(postMetaView(meta));
    },
  },
  {
    // A literal segment. It cannot be captured by posts-meta/:slug: that route is GET/PATCH only.
    // Not idempotent: renumbering is naturally repeatable. The list must be complete, otherwise
    // the numbers of the omitted posts would collide with the new ones.
    method: "PUT",
    pattern: "posts-meta/order",
    scope: "articles:write",
    idempotent: false,
    handler: async ({ request }) => {
      const { slugs } = postMetaOrderSchema.parse(await readJson(request));
      const known = new Set((await listAllMeta()).map((row) => row.slug));
      const requested = new Set(slugs);
      const unknown = slugs.filter((slug) => !known.has(slug));
      if (unknown.length)
        throw apiError(422, "unknown_slugs", "Some slugs have no posts_meta row.", {
          slugs: unknown,
        });
      const missing = [...known].filter((slug) => !requested.has(slug)).sort();
      if (missing.length)
        throw apiError(422, "incomplete_order", "Send every posts_meta slug exactly once.", {
          missing,
        });
      await reorderMeta(slugs);
      const rows = new Map((await listMetaBySlugs(slugs)).map((row) => [row.slug, row]));
      return jsonResponse({ items: slugs.map((slug) => postMetaView(rows.get(slug)!)) });
    },
  },
  {
    method: "PATCH",
    pattern: "posts-meta/:slug",
    scope: "articles:write",
    idempotent: false,
    handler: async ({ request, params, principal }) => {
      const slug = slugSchema.parse(params.slug);
      const patch = postMetaPatchSchema.parse(await readJson(request));
      // Hiding drops the post from /blog, the sitemap and llms.txt: a public effect, like mode=publish.
      if (patch.hiddenFromList !== undefined) requireScope(principal, "articles:publish");
      const meta = await setMetaFlags(slug, patch);
      if (!meta) throw apiError(404, "not_found", "Post metadata not found.");
      return jsonResponse(postMetaView(meta));
    },
  },
  {
    method: "GET",
    pattern: "keys",
    scope: "any",
    sessionOnly: true,
    idempotent: false,
    handler: async () => jsonResponse({ items: await listKeys(db) }),
  },
  {
    // Not idempotent: a stored response would keep the token in content_api_requests. A repeat
    // creates a second key.
    method: "POST",
    pattern: "keys",
    scope: "any",
    sessionOnly: true,
    idempotent: false,
    handler: async ({ request }) => {
      // The route is sessionOnly and a session holds every scope: nothing to subset-check.
      const input = createKeySchema.parse(await readJson(request));
      return jsonResponse(await createKey(db, input), 201);
    },
  },
  {
    method: "DELETE",
    pattern: "keys/:id",
    scope: "any",
    sessionOnly: true,
    idempotent: false,
    handler: async ({ params }) => jsonResponse(await revokeKey(db, articleId(params))),
  },
  {
    // Reading works with the feature flag off: the rows are history.
    method: "GET",
    pattern: "social",
    scope: "social:read",
    idempotent: false,
    handler: async ({ request }) =>
      jsonResponse(await listSocialDrafts(db, listSocialQuerySchema.parse(queryOf(request)))),
  },
  {
    // Not idempotent: a repeat finds the channels already covered and answers 200 with `[]`.
    method: "POST",
    pattern: "social/generate",
    scope: "social:write",
    idempotent: false,
    handler: async ({ request, principal }) => {
      const input = socialGenerateSchema.parse(await readJson(request));
      const result = await kickoffSocial({
        slug: input.slug,
        channels: input.channels,
        actor: { userId: actorOf(principal).userId },
      });
      if (!result.ok)
        throw apiError(result.code === "social_disabled" ? 403 : 503, result.code, result.reason);
      return jsonResponse({ channels: result.channels }, result.channels.length ? 202 : 200);
    },
  },
  {
    method: "PUT",
    pattern: "social/:id",
    scope: "social:write",
    idempotent: false,
    handler: async ({ request, params }) => {
      const id = articleId(params);
      const input = socialDraftUpdateSchema.parse(await readJson(request));
      return jsonResponse(socialDraftView(await saveDraft({ id, ...input })));
    },
  },
  {
    // Not idempotent on purpose: a repeat finds the draft no longer pending (409), so a post is
    // never sent twice. A draft the critic blocked needs `force: true` (409 critic_block).
    method: "POST",
    pattern: "social/:id/publish",
    scope: "social:publish",
    idempotent: false,
    handler: async ({ request, params, principal }) => {
      const id = articleId(params);
      const input = socialPublishSchema.parse(await readJson(request));
      const result = await publishDraft({
        id,
        force: input.force,
        actor: { userId: actorOf(principal).userId },
      });
      if (!result.ok)
        throw apiError(502, "social_send_failed", result.error, {
          draft: socialDraftView(result.draft),
        });
      return jsonResponse({ draft: socialDraftView(result.draft), url: result.url });
    },
  },
  {
    method: "POST",
    pattern: "social/:id/skip",
    scope: "social:write",
    idempotent: false,
    handler: async ({ request, params }) => {
      const id = articleId(params);
      const input = socialSkipSchema.parse(await readJson(request));
      return jsonResponse(socialDraftView(await skipDraft({ id, reason: input.reason })));
    },
  },
  {
    // No body: the critic reads the draft as stored.
    method: "POST",
    pattern: "social/:id/recheck",
    scope: "social:write",
    idempotent: false,
    handler: async ({ params }) =>
      jsonResponse(socialDraftView((await recheckDraft({ id: articleId(params) })).draft)),
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
