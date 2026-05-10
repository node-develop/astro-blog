import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { courses as course, lessons as lesson } from "~/lib/courses/schema";
import { POST_LIMITS, PROJECT_LIMITS, SITE_LIMITS } from "~/lib/content/limits";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(POST_LIMITS.title.min).max(POST_LIMITS.title.max),
    description: z.string().min(POST_LIMITS.description.min).max(POST_LIMITS.description.max),
    summary: z.string().min(POST_LIMITS.summary.min).max(POST_LIMITS.summary.max).optional(),
    keywords: z.array(z.string()).default([]),
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
  }),
});

const site = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/site" }),
  schema: z.object({
    title: z.string(),
    description: z
      .string()
      .min(SITE_LIMITS.description.min)
      .max(SITE_LIMITS.description.max)
      .optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
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
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(PROJECT_LIMITS.title.min).max(PROJECT_LIMITS.title.max),
    description: z.string().min(PROJECT_LIMITS.description.min).max(PROJECT_LIMITS.description.max),
    role: z.string().min(PROJECT_LIMITS.role.min).max(PROJECT_LIMITS.role.max),
    status: z.enum(["active", "maintained", "archived"]),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    stack: z.array(z.string()).default([]),
    outcomes: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string().min(2), url: z.string().url() })).default([]),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    featured: z.boolean().default(false),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

export const collections = { posts, site, projects, course, lesson };
