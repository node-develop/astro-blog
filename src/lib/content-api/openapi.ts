import { z } from "zod";
import {
  articleBySlugSchema,
  articleDocumentSchema,
  articleInputSchema,
  articleListSchema,
  articleStatusSchema,
  articleVersionSchema,
  createArticleSchema,
  createKeySchema,
  createdKeySchema,
  keyListSchema,
  keyViewSchema,
  mediaListSchema,
  postMetaListSchema,
  postMetaOrderSchema,
  postMetaPatchSchema,
  postMetaSchema,
  publicationListSchema,
  publicationSchema,
  publicationStateSchema,
  publishArticleSchema,
  publishBatchSchema,
  scopeSchema,
  socialChannelSchema,
  socialDraftListSchema,
  socialDraftSchema,
  socialDraftUpdateSchema,
  socialGenerateSchema,
  socialPublishSchema,
  socialSkipSchema,
  socialStatusSchema,
  translateArticleSchema,
  updateArticleSchema,
  versionListSchema,
} from "./contract";

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: "draft-2020-12", io: "input" });
const response = (description: string, model = "Error") => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${model}` } } },
});
const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const once = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,128}$" },
};
const slugParam = {
  name: "slug",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 100 },
};
const ifMatch = {
  name: "If-Match",
  in: "header",
  required: true,
  description:
    'The article version as one strong quoted integer, e.g. "3" (the ETag of GET /articles/{id}/). Missing: 428; malformed (*, W/"3", a list): 400; not the current version: 412.',
  schema: { type: "string", pattern: '^"[1-9][0-9]{0,8}"$' },
};
const query = (name: string, schema: object, description?: string) => ({
  name,
  in: "query",
  required: false,
  ...(description ? { description } : {}),
  schema,
});
const pagination = [
  query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }),
  query(
    "cursor",
    { type: "string" },
    "Opaque: pass the nextCursor of the previous page unchanged. Malformed values give 422.",
  ),
];
const operation = (
  summary: string,
  scope: string,
  input?: string,
  parameters: unknown[] = [],
  model = "ArticleResult",
  more: Readonly<{ success?: readonly number[]; errors?: Readonly<Record<string, string>> }> = {},
) => ({
  summary,
  description: `Required scope: ${scope}. 60 requests/minute/key (Bearer only).`,
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
  parameters,
  ...(input
    ? {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/${input}` } } },
        },
      }
    : {}),
  responses: {
    ...Object.fromEntries(
      (more.success
        ? more.success
        : model === "MediaResult"
          ? [201]
          : model === "ValidationResult"
            ? [200]
            : input === "CreateArticle"
              ? [201, 202]
              : input
                ? [200, 202]
                : [200]
      ).map((code) => [
        String(code),
        response(
          code === 202 ? "Publication queued; poll publication.statusUrl" : "Success",
          model,
        ),
      ]),
    ),
    "400": response("Malformed JSON, missing Idempotency-Key or malformed If-Match"),
    "401": response("Missing, invalid or revoked key, or no admin session"),
    "403": response("Insufficient scope or origin mismatch"),
    "404": response("Not found"),
    "409": response("Identity, idempotency, version or edit conflict"),
    ...Object.fromEntries(
      Object.entries(more.errors ?? {}).map(([code, text]) => [code, response(text)]),
    ),
    "413": response("Request too large"),
    "415": response("Unsupported Content-Type"),
    "422": response("Validation failed"),
    "429": response("Rate limited; Retry-After: 60"),
    "503": response("Service unavailable"),
  },
});
/** Keys are managed from the admin session only: Bearer keys get 403 key_cannot_manage_keys. */
const sessionOperation = (...args: Parameters<typeof operation>) => ({
  ...operation(...args),
  description: `Admin session cookie only (Bearer keys get 403 key_cannot_manage_keys). Required scope: ${args[1]}.`,
  security: [{ sessionCookie: [] }],
});
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "artka.dev Content API",
    version: "1.0.0",
    description:
      "Versioned ingestion of finished Markdown articles. Draft by default. Publication is asynchronous. See docs/content-api.md.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/articles/": {
      get: operation(
        "List articles, newest update first, with a computed status",
        "articles:read",
        undefined,
        [
          query("lang", { type: "string", enum: ["ru", "en"] }),
          query("status", { $ref: "#/components/schemas/ArticleStatus" }),
          query("agent", { type: "string", minLength: 1, maxLength: 100 }, "provenance.agent"),
          query("tag", { type: "string" }),
          query(
            "q",
            { type: "string", minLength: 1, maxLength: 200 },
            "Substring of slug or title",
          ),
          ...pagination,
        ],
        "ArticleList",
      ),
      post: operation(
        "Create an article",
        "articles:write (+ articles:publish for mode=publish)",
        "CreateArticle",
        [once],
      ),
    },
    "/articles/validate/": {
      post: operation(
        "Validate without saving",
        "articles:write",
        "CreateArticle",
        [],
        "ValidationResult",
      ),
    },
    "/articles/by-slug/{slug}/": {
      get: operation(
        "Read the ru and en versions of a slug (API-managed articles only)",
        "articles:read",
        undefined,
        [slugParam],
        "ArticleBySlug",
      ),
    },
    "/articles/{id}/versions/": {
      get: operation(
        "List saved versions, newest first (history may have gaps)",
        "articles:read",
        undefined,
        [id],
        "ArticleVersionList",
      ),
    },
    "/articles/{id}/versions/{n}/": {
      get: operation(
        "Read one saved version with its document",
        "articles:read",
        undefined,
        [
          id,
          {
            name: "n",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1, maximum: 999999999 },
          },
        ],
        "ArticleVersion",
      ),
    },
    "/articles/{id}/": {
      get: operation("Read document and latest publication", "articles:read", undefined, [id]),
      put: operation(
        "Replace an article using expectedVersion",
        "articles:write (+ articles:publish for mode=publish)",
        "UpdateArticle",
        [id, once],
      ),
      delete: operation(
        "Delete a draft that never went live (409 unpublish_first, was_published, publication_in_progress otherwise)",
        "articles:write",
        undefined,
        [id, ifMatch],
        "DeleteResult",
        { errors: { "412": "If-Match is not the current version", "428": "If-Match is missing" } },
      ),
    },
    "/articles/{id}/versions/{n}/restore/": {
      post: operation(
        "Save the document of version n as a new version",
        "articles:write",
        "PublishArticle",
        [
          id,
          {
            name: "n",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1, maximum: 999999999 },
          },
          once,
        ],
        "RestoreResult",
        { success: [200] },
      ),
    },
    "/articles/{id}/translate/": {
      post: operation(
        "Translate a Russian article into an English DRAFT with the same slug and externalId (calls the model, tens of seconds)",
        "articles:write",
        "TranslateArticle",
        [id, once],
        "TranslateResult",
        {
          success: [200, 201],
          errors: {
            "502": "translation_failed or translation_invalid: nothing was saved",
            "504": "translation_timeout: nothing was saved",
          },
        },
      ),
    },
    "/articles/{id}/unpublish/": {
      post: operation(
        "Remove this language's page: queues an unpublish publication",
        "articles:publish",
        "PublishArticle",
        [id, once],
      ),
    },
    "/publish/": {
      post: operation(
        "Publish the ru and en twins of one slug together, all or nothing",
        "articles:publish",
        "PublishBatch",
        [once],
        "BatchResult",
      ),
    },
    "/articles/{id}/publish/": {
      post: operation(
        "Publish current version or retry a failed publication",
        "articles:publish",
        "PublishArticle",
        [id, once],
      ),
    },
    "/publications/": {
      get: operation(
        "List publications, newest first",
        "articles:read",
        undefined,
        [
          query("articleId", { type: "string", format: "uuid" }),
          query("state", { $ref: "#/components/schemas/PublicationState" }),
          ...pagination,
        ],
        "PublicationList",
      ),
    },
    "/posts-meta/": {
      get: operation(
        "List every posts_meta row by order: the complete set that PUT /posts-meta/order/ needs",
        "articles:read",
        undefined,
        [],
        "PostMetaList",
      ),
    },
    "/posts-meta/order/": {
      put: operation(
        "Set the manual order: every posts_meta slug exactly once (422 unknown_slugs, incomplete_order)",
        "articles:write",
        "PostMetaOrder",
        [],
        "PostMetaList",
        { success: [200] },
      ),
    },
    "/posts-meta/{slug}/": {
      get: operation(
        "Read order, pinned and hidden flags of a post",
        "articles:read",
        undefined,
        [slugParam],
        "PostMeta",
      ),
      patch: operation(
        "Set pinned and/or hiddenFromList; hiding is public (removes the post from /blog, sitemap and llms.txt). 404 when the post has no row",
        "articles:write (+ articles:publish when hiddenFromList is sent)",
        "PostMetaPatch",
        [slugParam],
        "PostMeta",
        { success: [200] },
      ),
    },
    "/keys/": {
      get: sessionOperation(
        "List API keys, newest first, revoked ones included; no token hashes, no system key",
        "admin session",
        undefined,
        [],
        "KeyList",
      ),
      post: sessionOperation(
        "Create a key; the token is in this response only. Not idempotent: a repeat creates a second key. Scopes must be a subset of the session's own",
        "admin session",
        "CreateKey",
        [],
        "CreatedKey",
        { success: [201] },
      ),
    },
    "/keys/{id}/": {
      delete: sessionOperation(
        "Revoke a key (it stays in the list; its queued publications fail with key_revoked). 403 system_key_protected for the admin-session key",
        "admin session",
        undefined,
        [id],
        "RevokedKey",
      ),
    },
    "/social/": {
      get: operation(
        "List social drafts, newest first. Works with SOCIAL_DRAFTS_ENABLED off (history)",
        "social:read",
        undefined,
        [
          query("slug", { type: "string" }),
          query("status", { $ref: "#/components/schemas/SocialStatus" }),
          ...pagination,
        ],
        "SocialDraftList",
      ),
    },
    "/social/generate/": {
      post: operation(
        "Create the drafts a slug is missing: tg_ru, plus x_en and li_en once an EN twin is live. Per channel: a channel with a live draft or a sent post is left alone, and without `channels` one that was skipped (or whose send failed) for the same text is not brought back. 202 with the created channels, 200 with [] when nothing was missing. 403 social_disabled, 503 social_not_configured, 409 article_not_published, 404 article_not_found. Drafts are generated asynchronously: list them to see them become pending",
        "social:write",
        "SocialGenerate",
        [],
        "SocialGenerated",
        { success: [200, 202] },
      ),
    },
    "/social/{id}/": {
      put: operation(
        "Replace body (and threadTail) of a pending draft. 409 draft_not_pending otherwise",
        "social:write",
        "SocialDraftUpdate",
        [id],
        "SocialDraft",
        { success: [200] },
      ),
    },
    "/social/{id}/publish/": {
      post: operation(
        "Send a pending draft to its network. Not idempotent: a repeat is 409 draft_not_pending, so nothing is posted twice. A draft the critic blocked (`blocked: true`) needs force: 409 critic_block without it. 502 social_send_failed when the network refuses (the draft becomes failed)",
        "social:publish",
        "SocialPublish",
        [id],
        "SocialPublished",
        { success: [200], errors: { "502": "The network refused the post" } },
      ),
    },
    "/social/{id}/skip/": {
      post: operation(
        "Mark a pending draft skipped; an implicit generate will not bring that channel back",
        "social:write",
        "SocialSkip",
        [id],
        "SocialDraft",
        { success: [200] },
      ),
    },
    "/social/{id}/recheck/": {
      post: operation(
        "Run the critic again on the stored draft (no request body) and return the draft with fresh criticNotes",
        "social:write",
        undefined,
        [id],
        "SocialDraft",
      ),
    },
    "/publications/{id}/": {
      get: operation(
        "Read publication status",
        "articles:read",
        undefined,
        [id],
        "PublicationStatus",
      ),
    },
    "/whoami/": {
      get: operation(
        "Show who the caller is: key or admin session",
        "any authenticated principal",
        undefined,
        [],
        "Whoami",
      ),
    },
    "/media/": {
      get: operation(
        "List uploaded images, newest first; needs articles:read so that a read-only key can find assetIds",
        "articles:read",
        undefined,
        pagination,
        "MediaList",
      ),
      post: {
        ...operation(
          "Upload image bytes; repeated bytes return the same asset",
          "media:write",
          undefined,
          [],
          "MediaResult",
        ),
        requestBody: {
          required: true,
          content: Object.fromEntries(
            ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"].map((mime) => [
              mime,
              { schema: { type: "string", format: "binary" } },
            ]),
          ),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "artka_<random token>" },
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description:
          "Admin session cookie (administrators only; named __Secure-better-auth.session_token in production). Used only when no Authorization header is sent. Non-GET requests must carry an Origin header equal to the site origin. No rate limit.",
      },
    },
    schemas: {
      // The stored form, which every response carries; what a client sends is ArticleInput.
      ArticleDocument: schema(articleDocumentSchema),
      ArticleInput: schema(articleInputSchema),
      CreateArticle: schema(createArticleSchema),
      UpdateArticle: schema(updateArticleSchema),
      PublishArticle: schema(publishArticleSchema),
      PublishBatch: schema(publishBatchSchema),
      TranslateArticle: schema(translateArticleSchema),
      TranslateResult: {
        allOf: [
          { $ref: "#/components/schemas/ArticleResult" },
          {
            type: "object",
            required: ["translation", "warnings"],
            description:
              "201 for a new EN draft, 200 for an updated one or `unchanged: true` (already translated from this RU version, no model call).",
            properties: {
              translation: {
                type: "object",
                required: ["sourceVersion", "stale"],
                properties: {
                  sourceVersion: { type: "integer", minimum: 1 },
                  stale: { type: "boolean", const: false },
                },
              },
              unchanged: { type: "boolean", const: true },
              warnings: { type: "array", items: { type: "string" } },
            },
          },
        ],
      },
      DeleteResult: schema(z.object({ id: z.uuid(), deleted: z.literal(true) })),
      RestoreResult: {
        allOf: [
          { $ref: "#/components/schemas/ArticleResult" },
          {
            type: "object",
            required: ["restoredFrom"],
            properties: { restoredFrom: { type: "integer", minimum: 1 } },
          },
        ],
      },
      BatchResult: {
        type: "object",
        required: ["batchId", "items"],
        description:
          "202 when at least one item was queued, 200 (batchId null) when every item was unchanged.",
        properties: {
          batchId: { type: ["string", "null"], format: "uuid" },
          items: { type: "array", items: { $ref: "#/components/schemas/ArticleResult" } },
        },
      },
      Error: schema(
        z.object({
          error: z.object({
            code: z.string(),
            message: z.string(),
            requestId: z.uuid(),
            details: z.unknown().optional(),
          }),
        }),
      ),
      Whoami: schema(
        z.object({
          kind: z.enum(["key", "session"]),
          keyName: z.string(),
          scopes: z.array(scopeSchema),
        }),
      ),
      ValidationResult: schema(z.object({ valid: z.literal(true), warnings: z.array(z.string()) })),
      MediaResult: schema(
        z.object({
          asset: z.object({
            id: z.uuid(),
            url: z.url(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            mimeType: z.string(),
            byteSize: z.number().int().positive(),
          }),
        }),
      ),
      // Not strict here: PublicationStatus extends it with `url` through allOf.
      Publication: schema(z.object(publicationSchema.shape)),
      PublicationState: schema(publicationStateSchema),
      ArticleStatus: schema(articleStatusSchema),
      ArticleList: schema(articleListSchema),
      ArticleBySlug: schema(articleBySlugSchema),
      ArticleVersionList: schema(versionListSchema),
      ArticleVersion: schema(articleVersionSchema),
      PublicationList: schema(publicationListSchema),
      MediaList: schema(mediaListSchema),
      PostMeta: schema(postMetaSchema),
      PostMetaList: schema(postMetaListSchema),
      PostMetaPatch: schema(postMetaPatchSchema),
      PostMetaOrder: schema(postMetaOrderSchema),
      SocialChannel: schema(socialChannelSchema),
      SocialStatus: schema(socialStatusSchema),
      SocialGenerate: schema(socialGenerateSchema),
      SocialGenerated: schema(z.object({ channels: z.array(socialChannelSchema) })),
      SocialDraftUpdate: schema(socialDraftUpdateSchema),
      SocialPublish: schema(socialPublishSchema),
      SocialSkip: schema(socialSkipSchema),
      SocialDraft: schema(socialDraftSchema),
      SocialDraftList: schema(socialDraftListSchema),
      SocialPublished: schema(z.object({ draft: socialDraftSchema, url: z.string() })),
      KeyList: schema(keyListSchema),
      CreateKey: schema(createKeySchema),
      CreatedKey: schema(createdKeySchema),
      RevokedKey: schema(keyViewSchema.extend({ unchanged: z.boolean() })),
      PublicationStatus: {
        allOf: [
          { $ref: "#/components/schemas/Publication" },
          {
            type: "object",
            required: ["url"],
            properties: { url: { type: "string", format: "uri" } },
          },
        ],
      },
      ArticleResult: {
        type: "object",
        required: [
          "id",
          "version",
          "article",
          "publishedVersion",
          "state",
          "url",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          version: { type: "integer", minimum: 1 },
          article: { $ref: "#/components/schemas/ArticleDocument" },
          publishedVersion: { type: ["integer", "null"] },
          state: {
            type: "string",
            enum: ["draft", "published"],
            deprecated: true,
            description: "Deprecated: use status.",
          },
          status: { $ref: "#/components/schemas/ArticleStatus" },
          url: { type: "string", format: "uri" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          publication: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Publication" }] },
          warnings: { type: "array", items: { type: "string" } },
          unchanged: { type: "boolean" },
        },
      },
    },
  },
};
