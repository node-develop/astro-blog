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
  acknowledgedManualRevisionId: z.number().int().nonnegative().default(0),
  expectedRemoteHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
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
