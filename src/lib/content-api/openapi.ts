import { z } from "zod";
import {
  articleDocumentSchema,
  createArticleSchema,
  publishArticleSchema,
  updateArticleSchema,
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
const operation = (
  summary: string,
  scope: string,
  input?: string,
  parameters: unknown[] = [],
  model = "ArticleResult",
) => ({
  summary,
  description: `Required scope: ${scope}. 60 requests/minute/key.`,
  security: [{ bearerAuth: [] }],
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
    "401": response("Missing, invalid or revoked key"),
    "403": response("Insufficient scope"),
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
    "/articles": {
      post: operation(
        "Create an article",
        "articles:write (+ articles:publish for mode=publish)",
        "CreateArticle",
        [once],
      ),
    },
    "/articles/validate": {
      post: operation(
        "Validate without saving",
        "articles:write",
        "CreateArticle",
        [],
        "ValidationResult",
      ),
    },
    "/articles/{id}": {
      get: operation(
        "Read document, latest manual revision and remote content",
        "articles:read",
        undefined,
        [id],
      ),
      put: operation(
        "Replace an article using expectedVersion",
        "articles:write (+ articles:publish for mode=publish)",
        "UpdateArticle",
        [id, once],
      ),
    },
    "/articles/{id}/publish": {
      post: operation(
        "Publish current version or retry a failed publication",
        "articles:publish",
        "PublishArticle",
        [id, once],
      ),
    },
    "/publications/{id}": {
      get: operation(
        "Read publication status",
        "articles:read",
        undefined,
        [id],
        "PublicationStatus",
      ),
    },
    "/media": {
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
      Publication: {
        type: "object",
        required: [
          "id",
          "articleId",
          "version",
          "state",
          "commitSha",
          "attempts",
          "error",
          "createdAt",
          "updatedAt",
          "statusUrl",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          articleId: { type: "string", format: "uuid" },
          version: { type: "integer", minimum: 1 },
          state: { type: "string", enum: ["queued", "publishing", "published", "failed"] },
          commitSha: { type: ["string", "null"] },
          attempts: { type: "integer", minimum: 0 },
          error: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                required: ["code", "message"],
                properties: { code: { type: "string" }, message: { type: "string" } },
              },
            ],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          statusUrl: { type: "string" },
        },
      },
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
          manualEditsPending: { type: "boolean" },
          manualRevision: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  slug: { type: "string" },
                  frontmatter: { type: "object" },
                  body: { type: "string" },
                  authorId: { type: "string", format: "uuid" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
            ],
          },
          remote: {
            type: "object",
            required: ["available"],
            properties: {
              available: { type: "boolean" },
              content: { type: ["string", "null"] },
              hash: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};
