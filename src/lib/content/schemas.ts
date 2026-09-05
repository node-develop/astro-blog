/**
 * Plain Zod schemas for post, site, and project frontmatter.
 * Exported without `defineCollection`/`glob` so they can be imported
 * by Node scripts (translate-check.ts) that run outside Astro's build context.
 *
 * `src/content.config.ts` wraps these in `defineCollection({ schema, loader })`.
 */
import { z } from "zod";
import { POST_LIMITS, PROJECT_LIMITS, SITE_LIMITS } from "./limits";

export const postSchema = z.object({
  title: z.string().min(POST_LIMITS.title.min).max(POST_LIMITS.title.max),
  description: z.string().min(POST_LIMITS.description.min).max(POST_LIMITS.description.max),
  // TL;DR — answer-first 60–280-char card rendered above the post body.
  // Required for posts authored after 2026-05-02 (enforced by tests/unit/content/schema.test.ts).
  summary: z.string().min(POST_LIMITS.summary.min).max(POST_LIMITS.summary.max).optional(),
  // Semantic keywords for retrieval. Distinct from `tags` (which are slugs
  // used for tag archives). Free-form short noun phrases.
  keywords: z.array(z.string()).default([]),
  // Question/Answer pairs for FAQPage JSON-LD.
  faq: z
    .array(
      z.object({
        question: z.string().min(POST_LIMITS.faqQuestion.min).max(POST_LIMITS.faqQuestion.max),
        answer: z.string().min(POST_LIMITS.faqAnswer.min).max(POST_LIMITS.faqAnswer.max),
      }),
    )
    .optional(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  cover: z.string().optional(),
  coverAlt: z.string().optional(),
  sourceHash: z.string().optional(),
  manuallyEdited: z.boolean().default(false),
  author: z.string().default("Артём"),
  lang: z.enum(["ru", "en"]).optional(),
});

export const siteSchema = z.object({
  title: z.string(),
  description: z
    .string()
    .min(SITE_LIMITS.description.min)
    .max(SITE_LIMITS.description.max)
    .optional(),
  sourceHash: z.string().optional(),
  manuallyEdited: z.boolean().default(false),
  // Home page fields (only present in home.md / en/home.md)
  heroEyebrow: z.string().optional(),
  heroTitle: z.string().optional(),
  heroLede: z.string().optional(),
  heroCta: z.string().optional(),
  courseEyebrow: z.string().optional(),
  courseTitle: z.string().optional(),
  courseLede: z.string().optional(),
  courseCta: z.string().optional(),
  latestLabel: z.string().optional(),
  authorLabel: z.string().optional(),
  authorBio: z.string().optional(),
  authorLinksAria: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

export const projectSchema = z.object({
  title: z.string().min(PROJECT_LIMITS.title.min).max(PROJECT_LIMITS.title.max),
  description: z.string().min(PROJECT_LIMITS.description.min).max(PROJECT_LIMITS.description.max),
  role: z.string().min(PROJECT_LIMITS.role.min).max(PROJECT_LIMITS.role.max),
  status: z.enum(["active", "maintained", "archived"]),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  stack: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).default([]),
  links: z.array(z.object({ label: z.string().min(2), url: z.url() })).default([]),
  cover: z.string().optional(),
  coverAlt: z.string().optional(),
  featured: z.boolean().default(false),
  sourceHash: z.string().optional(),
  manuallyEdited: z.boolean().default(false),
});
