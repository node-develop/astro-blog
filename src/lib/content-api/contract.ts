import { z } from "zod";
import { POST_LIMITS } from "../content/limits";

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shortText = (min: number, max: number) => z.string().trim().min(min).max(max);
export const sourceSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(2048),
  title: shortText(1, 200),
});
export const assetRefSchema = z.strictObject({
  assetId: z.uuid(),
  alt: shortText(1, 500),
  caption: shortText(1, 500).optional(),
});
export const articleDocumentSchema = z.strictObject({
  externalId: shortText(1, 200),
  lang: z.enum(["ru", "en"]),
  slug: slugSchema,
  title: shortText(POST_LIMITS.title.min, POST_LIMITS.title.max),
  description: shortText(POST_LIMITS.description.min, POST_LIMITS.description.max),
  summary: shortText(POST_LIMITS.summary.min, POST_LIMITS.summary.max),
  body: z.string().trim().min(1).max(200_000),
  tags: z.array(slugSchema).min(1).max(20),
  keywords: z.array(shortText(1, 80)).max(40).default([]),
  sources: z.array(sourceSchema).min(1).max(30),
  cover: assetRefSchema.optional(),
  socialImage: assetRefSchema.optional(),
  seo: z
    .strictObject({
      title: shortText(3, 120).optional(),
      description: shortText(10, 200).optional(),
    })
    .optional(),
  faq: z
    .array(
      z.strictObject({
        question: shortText(POST_LIMITS.faqQuestion.min, POST_LIMITS.faqQuestion.max),
        answer: shortText(POST_LIMITS.faqAnswer.min, POST_LIMITS.faqAnswer.max),
      }),
    )
    .max(20)
    .default([]),
  relatedSlugs: z.array(slugSchema).max(10).default([]),
  provenance: z.strictObject({
    agent: shortText(1, 100),
    model: shortText(1, 100).optional(),
  }),
});
export const createArticleSchema = z.strictObject({
  article: articleDocumentSchema,
  mode: z.enum(["draft", "publish"]).default("draft"),
});
export const updateArticleSchema = createArticleSchema.extend({
  expectedVersion: z.number().int().positive(),
});
export const publishArticleSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
export const scopeSchema = z.enum([
  "articles:read",
  "articles:write",
  "articles:publish",
  "media:write",
]);
export type ApiScope = z.infer<typeof scopeSchema>;
export type ArticleDocument = z.infer<typeof articleDocumentSchema>;

// These optional fields extend the existing Markdown contract without changing old posts.
export const apiFrontmatterFields = {
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(200).optional(),
  socialImage: z.string().url().optional(),
  socialImageAlt: z.string().optional(),
  socialImageWidth: z.number().int().positive().optional(),
  socialImageHeight: z.number().int().positive().optional(),
  coverCaption: z.string().optional(),
  apiRevision: z.string().uuid().optional(),
};

// ── Reading ────────────────────────────────────────────────────────────────

export const articleStatusSchema = z.enum([
  "draft",
  "published",
  "changed",
  "publishing",
  "failed",
  "unpublished",
]);
export type ArticleStatus = z.infer<typeof articleStatusSchema>;

/** Microsecond-precision UTC instant, exactly as Postgres `to_char(... 'US')` renders it. */
const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
/** The regex alone accepts month 13: round-trip the millisecond prefix through Date. */
const isRealInstant = (at: string): boolean => {
  const millis = `${at.slice(0, 23)}Z`;
  const date = new Date(millis);
  return !Number.isNaN(date.getTime()) && date.toISOString() === millis;
};
export type Cursor = Readonly<{ at: string; id: string }>;
export const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify({ at: cursor.at, id: cursor.id })).toString("base64url");
/** Opaque to clients. Anything that is not our own output is a ZodError (422), never a database error. */
export const cursorSchema = z
  .string()
  .max(300)
  .transform((value, ctx): unknown => {
    try {
      return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid cursor" });
      return z.NEVER;
    }
  })
  .pipe(
    z.strictObject({
      at: z.string().regex(CURSOR_AT).refine(isRealInstant, "invalid cursor instant"),
      id: z.uuid(),
    }),
  );

/** Plain decimal digits only: `Number()` would also accept `1e1`, `0x10` and padded input. */
const limitSchema = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .transform(Number)
  .pipe(z.number().max(100))
  .default(20);
export const listArticlesQuerySchema = z.strictObject({
  lang: z.enum(["ru", "en"]).optional(),
  status: articleStatusSchema.optional(),
  agent: z.string().min(1).max(100).optional(),
  tag: slugSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});
export const publicationStateSchema = z.enum(["queued", "publishing", "published", "failed"]);
export const listPublicationsQuerySchema = z.strictObject({
  articleId: z.uuid().optional(),
  state: publicationStateSchema.optional(),
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});
export const listMediaQuerySchema = z.strictObject({
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type ListPublicationsQuery = z.infer<typeof listPublicationsQuerySchema>;
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;

// Response schemas are strict on purpose: a column added to a table must not leak
// into a response unnoticed, and parsing a response in tests must be able to fail.
const instant = z.iso.datetime();
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });

export const articleListItemSchema = z.strictObject({
  id: z.uuid(),
  slug: slugSchema,
  lang: z.enum(["ru", "en"]),
  title: z.string(),
  tags: z.array(z.string()),
  url: z.string(),
  provenance: z.strictObject({ agent: z.string() }),
  version: z.number().int().positive(),
  publishedVersion: z.number().int().positive().nullable(),
  status: articleStatusSchema,
  updatedAt: instant,
});
export const articleListSchema = pageSchema(articleListItemSchema);
export const articleBySlugSchema = z.strictObject({
  ru: articleListItemSchema.nullable(),
  en: articleListItemSchema.nullable(),
  translation: z
    .strictObject({ sourceVersion: z.number().int().positive().nullable(), stale: z.boolean() })
    .nullable(),
});
export const versionMetaSchema = z.strictObject({
  articleId: z.uuid(),
  version: z.number().int().positive(),
  actorKeyId: z.uuid().nullable(),
  actorUserId: z.uuid().nullable(),
  createdAt: instant,
});
/** `document` is the history "as saved": it is not re-validated against today's write contract. */
export const articleVersionSchema = versionMetaSchema.extend({
  document: z.record(z.string(), z.unknown()),
});
export const versionListSchema = z.strictObject({
  currentVersion: z.number().int().positive(),
  items: z.array(versionMetaSchema),
});
export const publicationSchema = z.strictObject({
  id: z.uuid(),
  articleId: z.uuid(),
  version: z.number().int().positive(),
  state: publicationStateSchema,
  commitSha: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  error: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
  createdAt: instant,
  updatedAt: instant,
  statusUrl: z.string(),
});
/** `kind` exists only in the list: single-publication and write responses (and stored idempotent replays) never carry it. */
export const publicationListItemSchema = publicationSchema.extend({
  kind: z.enum(["publish", "unpublish"]),
});
export const publicationListSchema = pageSchema(publicationListItemSchema);
export const mediaItemSchema = z.strictObject({
  id: z.uuid(),
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string(),
  byteSize: z.number().int().positive(),
  createdAt: instant,
});
export const mediaListSchema = pageSchema(mediaItemSchema);
export const postMetaSchema = z.strictObject({
  slug: z.string(),
  order: z.number().int(),
  pinned: z.boolean(),
  hiddenFromList: z.boolean(),
  updatedAt: instant,
});
