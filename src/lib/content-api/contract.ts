import { z } from "zod";
import { POST_LIMITS } from "../content/limits";

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shortText = (min: number, max: number) => z.string().trim().min(min).max(max);
/** Limits of the text fields that POST_LIMITS does not cover; the translation checks the same numbers. */
export const TEXT_LIMITS = {
  keyword: { min: 1, max: 80 },
  seoTitle: { min: 3, max: 120 },
  seoDescription: { min: 10, max: 200 },
  /** Alt text and caption of an image. */
  imageText: { min: 1, max: 500 },
} as const;
export const sourceSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(2048),
  title: shortText(1, 200),
});
export const assetRefSchema = z.strictObject({
  assetId: z.uuid(),
  alt: shortText(TEXT_LIMITS.imageText.min, TEXT_LIMITS.imageText.max),
  caption: shortText(TEXT_LIMITS.imageText.min, TEXT_LIMITS.imageText.max).optional(),
});
/** Provenance agent recorded for an admin session; the key name is used for a Bearer key. */
export const SESSION_AGENT = "admin";
/** Name of the key row that stands for an admin session. Re-exported by db/schema. */
export const ADMIN_SESSION_KEY_NAME = "admin-session";
/**
 * A site image under /uploads/ (no `..`: a segment cannot start with a dot) or an absolute https
 * URL. The file under /uploads/ is checked to exist when the article is validated; an https
 * image is probed before the page is committed (see ./cover.ts).
 */
const UPLOADS_PATH =
  /^\/uploads\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|avif|gif)$/i;
/**
 * The server probes an https cover, so hosts that only make sense inside a network are refused
 * here (422 at create time): IP literals, localhost, names without a dot, .local/.internal.
 * Resolved-IP filtering (DNS pointing at a private address) is not done; see the spec, risks.
 */
const isPublicHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+(?:\.\d+){0,3}$/.test(host)) return false;
  if (!host.includes(".")) return false;
  return !/\.(?:local|internal|localhost)$/.test(host);
};
const publicHttpsUrl = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => !URL.canParse(value) || isPublicHost(new URL(value).hostname), {
    message: "the host must be a public domain name, not an IP address or an internal name",
  });
export const coverUrlSchema = z.union([z.string().max(300).regex(UPLOADS_PATH), publicHttpsUrl]);
/** A cover is an uploaded asset or a plain URL; only the asset form can carry a social image. */
export const coverRefSchema = z.union([
  assetRefSchema,
  z.strictObject({
    url: coverUrlSchema,
    alt: shortText(TEXT_LIMITS.imageText.min, TEXT_LIMITS.imageText.max),
    caption: shortText(TEXT_LIMITS.imageText.min, TEXT_LIMITS.imageText.max).optional(),
  }),
]);
export const langSchema = z.enum(["ru", "en"]);
export const articleDocumentSchema = z.strictObject({
  externalId: shortText(1, 200),
  lang: langSchema,
  slug: slugSchema,
  title: shortText(POST_LIMITS.title.min, POST_LIMITS.title.max),
  description: shortText(POST_LIMITS.description.min, POST_LIMITS.description.max),
  summary: shortText(POST_LIMITS.summary.min, POST_LIMITS.summary.max),
  body: z.string().trim().min(1).max(200_000),
  tags: z.array(slugSchema).min(1).max(20),
  keywords: z
    .array(shortText(TEXT_LIMITS.keyword.min, TEXT_LIMITS.keyword.max))
    .max(40)
    .default([]),
  sources: z.array(sourceSchema).min(1).max(30),
  cover: coverRefSchema.optional(),
  socialImage: assetRefSchema.optional(),
  seo: z
    .strictObject({
      title: shortText(TEXT_LIMITS.seoTitle.min, TEXT_LIMITS.seoTitle.max).optional(),
      description: shortText(
        TEXT_LIMITS.seoDescription.min,
        TEXT_LIMITS.seoDescription.max,
      ).optional(),
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
/**
 * What a client may send. The stored document (`articleDocumentSchema`) is always complete:
 * `externalId` and `provenance.agent` depend on the caller or on the stored article, so they are
 * filled in by `completeArticle` before anything is saved, never by this static schema.
 */
export const articleInputSchema = articleDocumentSchema.extend({
  externalId: shortText(1, 200)
    .optional()
    .describe(
      "Defaults to slug, or to the externalId of the other language's article of that slug.",
    ),
  provenance: z
    .strictObject({
      agent: shortText(1, 100)
        .optional()
        .describe("Defaults to the key name ('admin' for a session)."),
      model: shortText(1, 100).optional(),
    })
    .optional(),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;
/** Completes an input into a stored document. Issue paths read `article.…`, like every other 422 here. */
export const completeArticle = (
  input: ArticleInput,
  defaults: Readonly<{ externalId: string; agent: string }>,
): ArticleDocument =>
  z.strictObject({ article: articleDocumentSchema }).parse({
    article: {
      ...input,
      externalId: input.externalId ?? defaults.externalId,
      provenance: {
        agent: input.provenance?.agent ?? defaults.agent,
        ...(input.provenance?.model ? { model: input.provenance.model } : {}),
      },
    },
  }).article;
export const createArticleSchema = z.strictObject({
  article: articleInputSchema,
  mode: z.enum(["draft", "publish"]).default("draft"),
});
/**
 * `force` publishes past a critic `block` note (409 `editorial_block`). Optional with no default on
 * purpose: a default would change the canonical request that Idempotency-Key hashes cover, and
 * clients that never send it must keep replaying.
 */
const forceField = z
  .boolean()
  .optional()
  .describe("Publish although the latest review of this content has a block note.");
export const updateArticleSchema = createArticleSchema.extend({
  expectedVersion: z.number().int().positive(),
  force: forceField,
});
export const publishArticleSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
/** POST /articles/{id}/publish/: restore and unpublish share `publishArticleSchema`, without `force`. */
export const publishOneSchema = publishArticleSchema.extend({ force: forceField });
/** POST /articles/{id}/review/: the version the critic is asked to read. */
export const reviewArticleSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
/** A note of the article critic. `quote` is a passage of the article; `reason` says what is wrong. */
export const articleReviewNoteSchema = z.strictObject({
  severity: z.enum(["block", "warn"]),
  quote: z.string().max(1000),
  reason: z.string().min(1).max(2000),
});
export type ArticleReviewNote = z.infer<typeof articleReviewNoteSchema>;
/** What is kept on the version row. `documentHash` ties the review to the content it read. */
export type StoredReview = Readonly<{
  model: string;
  reviewedAt: string;
  documentHash: string;
  notes: readonly ArticleReviewNote[];
}>;
export const articleReviewSchema = z.strictObject({
  articleId: z.uuid(),
  version: z.number().int().positive(),
  model: z.string(),
  reviewedAt: z.string(),
  notes: z.array(articleReviewNoteSchema),
  /** True when a note has severity `block`: publishing then needs `force: true`. */
  blocked: z.boolean(),
});
/** Only RU → EN exists; `force` overwrites an EN article that a person edited. */
export const translateArticleSchema = z.strictObject({
  targetLang: z.literal("en"),
  force: z.boolean().default(false),
});
export type TranslateArticleInput = z.infer<typeof translateArticleSchema>;
/** One publication per item, all of one slug pair (ru + en); 1..2 items, no repeated ids. */
export const publishBatchSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.uuid(),
        expectedVersion: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(2)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
      message: "items must not repeat an id",
    }),
  force: forceField,
});
export const scopeSchema = z.enum([
  "articles:read",
  "articles:write",
  "articles:publish",
  "media:write",
  "social:read",
  "social:write",
  "social:publish",
  "content:export",
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
  lang: langSchema.optional(),
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
  lang: langSchema,
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
  commitSha: z
    .string()
    .nullable()
    .describe(
      "Deprecated: always null for publications created since stage 2.4 (no git commit); historical rows keep their sha.",
    ),
  attempts: z.number().int().nonnegative(),
  error: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
  createdAt: instant,
  updatedAt: instant,
  statusUrl: z.string(),
  /** Optional: replays of responses stored before 1.5 do not carry it. */
  kind: z.enum(["publish", "unpublish"]).optional(),
});
/** Listings always carry `kind`. */
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
export const postMetaListSchema = z.strictObject({ items: z.array(postMetaSchema) });
/** hiddenFromList also needs articles:publish: hiding removes the post from /blog, sitemap and llms.txt. */
export const postMetaPatchSchema = z
  .strictObject({ pinned: z.boolean().optional(), hiddenFromList: z.boolean().optional() })
  .refine((value) => value.pinned !== undefined || value.hiddenFromList !== undefined, {
    message: "send pinned, hiddenFromList or both",
  });
/** The complete order: every posts_meta slug exactly once. */
export const postMetaOrderSchema = z.strictObject({
  slugs: z
    .array(slugSchema)
    .min(1)
    .max(1000)
    .refine((slugs) => new Set(slugs).size === slugs.length, { message: "slugs must not repeat" }),
});

// ── Keys (admin session only) ──────────────────────────────────────────────

const RESERVED_KEY_NAMES: readonly string[] = [ADMIN_SESSION_KEY_NAME, SESSION_AGENT];
export const createKeySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((name) => !RESERVED_KEY_NAMES.includes(name.toLowerCase()), {
      message: "this name is reserved",
    }),
  scopes: z
    .array(scopeSchema)
    .min(1)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: "scopes must not repeat",
    }),
});
export type CreateKeyInput = z.infer<typeof createKeySchema>;
/** Never carries a token hash. */
export const keyViewSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(scopeSchema),
  createdAt: instant,
  revokedAt: instant.nullable(),
});
export const keyListSchema = z.strictObject({ items: z.array(keyViewSchema) });
/** The only response that ever contains the token. */
export const createdKeySchema = keyViewSchema.extend({ token: z.string() });

// ── Social drafts ──────────────────────────────────────────────────────────

export const socialChannelSchema = z.enum(["x_en", "li_en", "tg_ru"]);
export const socialStatusSchema = z.enum([
  "generating",
  "pending",
  "sending",
  "sent",
  "failed",
  "superseded",
  "skipped",
]);
/** `channels` omitted: the channels that fit the article (tg_ru, plus x_en and li_en with a live EN twin). */
export const socialGenerateSchema = z.strictObject({
  slug: slugSchema,
  channels: z
    .array(socialChannelSchema)
    .min(1)
    .max(3)
    .refine((channels) => new Set(channels).size === channels.length, {
      message: "channels must not repeat",
    })
    .optional(),
});
export const socialDraftUpdateSchema = z.strictObject({
  body: z.string().min(1).max(10_000),
  threadTail: z.array(z.string().min(1).max(10_000)).max(25).optional(),
});
/** `force` publishes a draft the critic marked `block`. */
export const socialPublishSchema = z.strictObject({ force: z.boolean().default(false) });
export const socialSkipSchema = z.strictObject({ reason: z.string().max(500).optional() });
export const listSocialQuerySchema = z.strictObject({
  slug: slugSchema.optional(),
  status: socialStatusSchema.optional(),
  limit: limitSchema,
  cursor: cursorSchema.optional(),
});
export type ListSocialQuery = z.infer<typeof listSocialQuerySchema>;

const criticNoteSchema = z.union([
  z.looseObject({
    severity: z.literal("block"),
    kind: z.enum(["fact", "policy"]),
    message: z.string(),
  }),
  z.looseObject({
    severity: z.literal("warn"),
    kind: z.enum(["tone", "length"]),
    message: z.string(),
  }),
]);
export const socialDraftSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  channel: socialChannelSchema,
  status: socialStatusSchema,
  body: z.string(),
  threadTail: z.array(z.string()).nullable(),
  mediaUrl: z.string().nullable(),
  criticNotes: z.array(criticNoteSchema),
  /** True when a critic note has severity `block`: publishing then needs `force`. */
  blocked: z.boolean(),
  errorMessage: z.string().nullable(),
  externalUrl: z.string().nullable(),
  sentAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
});
export const socialDraftListSchema = pageSchema(socialDraftSchema);

/** One article of the desired build state; `revision` is the publication whose content this is. */
export const exportArticleSchema = z.strictObject({
  slug: slugSchema,
  lang: langSchema,
  revision: z.uuid(),
  content: z.string(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  meta: z.strictObject({
    order: z.number().int(),
    pinned: z.boolean(),
    hiddenFromList: z.boolean(),
  }),
});
/**
 * GET /export/: the desired state of the next site build. `snapshotId` is derived from the
 * revisions and meta (same content, same id); `generatedAt` is not part of it. Consumers must
 * check `count === articles.length`: a stream that broke midway is not valid JSON, but a
 * client that tolerates it must still not trust a short list.
 */
export const exportSchema = z
  .strictObject({
    snapshotId: z.uuid(),
    generatedAt: instant,
    count: z.number().int().nonnegative(),
    articles: z.array(exportArticleSchema),
  })
  .refine((snapshot) => snapshot.count === snapshot.articles.length, {
    message: "count must equal the number of articles",
  });
export type ExportArticle = z.infer<typeof exportArticleSchema>;
export type ExportSnapshot = z.infer<typeof exportSchema>;
