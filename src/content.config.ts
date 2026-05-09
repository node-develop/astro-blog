import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { courses as course, lessons as lesson } from "~/lib/courses/schema";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    // TL;DR — answer-first 60–280-char card rendered above the post body.
    // Required for posts authored after 2026-05-02 (enforced by tests/unit/content/schema.test.ts).
    summary: z.string().min(60).max(280).optional(),
    // Semantic keywords for retrieval. Distinct from `tags` (which are slugs
    // used for tag archives). Free-form short noun phrases — examples:
    // "harness", "prompt caching", "tool use loop".
    keywords: z.array(z.string()).default([]),
    // Question/Answer pairs. When non-empty, PostLayout renders a <Faq>
    // block below the body and emits a FAQPage JSON-LD node into the
    // single page @graph (via extraSchemaNodes).
    faq: z
      .array(
        z.object({
          question: z.string().min(5).max(200),
          answer: z.string().min(20).max(2000),
        }),
      )
      .optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Cover stores a relative path under /uploads/ (public URL, not a local asset).
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
    author: z.string().default("Артём"),
    // Explicit locale. Optional; PostLayout derives from path when absent.
    // Useful for round-tripping in the translation pipeline.
    lang: z.enum(["ru", "en"]).optional(),
  }),
});

const site = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/site" }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(10).max(200).optional(),
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
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    role: z.string().min(2).max(80),
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
