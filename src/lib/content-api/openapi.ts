import { z } from "zod";
import {
  articleBySlugSchema,
  articleDocumentSchema,
  articleListSchema,
  articleStatusSchema,
  articleVersionSchema,
  createArticleSchema,
  mediaListSchema,
  postMetaSchema,
  publicationListSchema,
  publicationSchema,
  publicationStateSchema,
  publishArticleSchema,
  scopeSchema,
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
      (model === "MediaResult"
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
    "400": response("Malformed JSON or missing Idempotency-Key"),
    "401": response("Missing, invalid or revoked key, or no admin session"),
    "403": response("Insufficient scope or origin mismatch"),
    "404": response("Not found"),
    "409": response("Identity, idempotency, version or edit conflict"),
    "413": response("Request too large"),
    "415": response("Unsupported Content-Type"),
    "422": response("Validation failed"),
    "429": response("Rate limited; Retry-After: 60"),
    "503": response("Service unavailable"),
  },
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
    "/posts-meta/{slug}/": {
      get: operation(
        "Read order, pinned and hidden flags of a post",
        "articles:read",
        undefined,
        [slugParam],
        "PostMeta",
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
      ArticleDocument: schema(articleDocumentSchema),
      CreateArticle: schema(createArticleSchema),
      UpdateArticle: schema(updateArticleSchema),
      PublishArticle: schema(publishArticleSchema),
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
          state: { type: "string", enum: ["draft", "published"] },
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
