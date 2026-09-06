import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "~/lib/db";
import { postsMeta } from "~/lib/db/schema";
import { POST_LIMITS } from "~/lib/content/limits";
import {
  reorderMeta,
  ensureMeta,
  deleteMeta,
  setSearchVector,
  searchPostsMeta,
} from "~/lib/db/repo/posts-meta";
import { appendRevision } from "~/lib/db/repo/revisions";
import {
  serializeFrontmatter,
  stripLeadingFrontmatter,
  type Frontmatter,
} from "~/lib/content/frontmatter";
import { writePostAtomically } from "~/lib/fs/post-writer";
import { POSTS_DIR, resolveSafe } from "~/lib/fs/paths";
import { logger } from "~/lib/logger";
import { schedulePagefindRebuild } from "~/lib/search/pagefind-rebuild";
import { assertAdmin } from "./_auth";

/**
 * Input schema for `posts.upsert`. Exported so unit tests can validate the
 * contract without spinning up the full action handler (which would require
 * mocking the DB, filesystem, and search index).
 *
 * Frontmatter limits are kept in sync with `src/content.config.ts` — a
 * mismatch would let the admin form save a post that breaks the next build.
 */
export const postUpsertInput = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "invalid slug"),
  frontmatter: z.object({
    title: z.string().min(POST_LIMITS.title.min).max(POST_LIMITS.title.max),
    // Synced with the content-collection schema in `src/content.config.ts`.
    description: z.string().min(POST_LIMITS.description.min).max(POST_LIMITS.description.max),
    // Optional TL;DR card (60..280). Empty string "" is normalised to
    // `undefined` so the form can post a blank textarea without a manual
    // unset step.
    summary: z
      .string()
      .max(POST_LIMITS.summary.max)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined))
      .pipe(z.string().min(POST_LIMITS.summary.min).max(POST_LIMITS.summary.max).optional()),
    keywords: z.array(z.string().min(1).max(80)).max(40).default([]),
    faq: z
      .array(
        z.object({
          question: z.string().min(POST_LIMITS.faqQuestion.min).max(POST_LIMITS.faqQuestion.max),
          answer: z.string().min(POST_LIMITS.faqAnswer.min).max(POST_LIMITS.faqAnswer.max),
        }),
      )
      .max(20)
      .optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
  }),
  body: z.string().default(""),
});

export type PostFrontmatterInput = z.infer<typeof postUpsertInput>["frontmatter"];

/**
 * Builds the on-disk `Frontmatter` from validated action input. Shared by
 * `posts.upsert` and `revisions.restore` so both write paths persist the
 * same set of fields (summary / keywords / faq included) — a restore must
 * never silently drop fields that an upsert would have written.
 */
export const toPostFrontmatter = (fm: PostFrontmatterInput): Frontmatter => ({
  title: fm.title,
  description: fm.description,
  pubDate: fm.pubDate,
  tags: fm.tags,
  draft: fm.draft,
  ...(fm.updatedDate ? { updatedDate: fm.updatedDate } : {}),
  ...(fm.cover ? { cover: fm.cover } : {}),
  ...(fm.coverAlt ? { coverAlt: fm.coverAlt } : {}),
  ...(fm.summary ? { summary: fm.summary } : {}),
  ...(fm.keywords.length > 0 ? { keywords: fm.keywords } : {}),
  ...(fm.faq && fm.faq.length > 0 ? { faq: fm.faq } : {}),
});

export const posts = {
  reorder: defineAction({
    input: z.object({
      slugs: z.array(z.string().min(1)).min(1),
    }),
    handler: async ({ slugs }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      await reorderMeta(slugs);
      return { ok: true as const };
    },
  }),

  setVisibility: defineAction({
    input: z.object({
      slug: z.string().min(1),
      hiddenFromList: z.boolean(),
    }),
    handler: async ({ slug, hiddenFromList }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      await db
        .update(postsMeta)
        .set({ hiddenFromList, updatedAt: new Date() })
        .where(eq(postsMeta.slug, slug));
      return { ok: true as const };
    },
  }),

  setPinned: defineAction({
    input: z.object({
      slug: z.string().min(1),
      pinned: z.boolean(),
    }),
    handler: async ({ slug, pinned }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      await db
        .update(postsMeta)
        .set({ pinned, updatedAt: new Date() })
        .where(eq(postsMeta.slug, slug));
      return { ok: true as const };
    },
  }),

  upsert: defineAction({
    input: postUpsertInput,
    handler: async (input, context) => {
      const user = context.locals.user as { id: string; role?: string | null } | null;
      assertAdmin(user);

      const meta = await ensureMeta(input.slug);

      // Defense-in-depth: if the author pasted a full markdown file (with a
      // YAML fence at the top) into the body textarea, strip the duplicate
      // block before persisting. The form-level fields are authoritative.
      const { body: cleanBody, hadFrontmatter } = stripLeadingFrontmatter(input.body);
      const warnings: string[] = [];
      if (hadFrontmatter) warnings.push("body_had_frontmatter");

      const fmObject = toPostFrontmatter(input.frontmatter);

      // Step 1: DB transaction — insert revision (clean body, so future
      // rollbacks restore a sanitised file too).
      const revision = await appendRevision({
        slug: input.slug,
        frontmatter: fmObject,
        body: cleanBody,
        authorId: user!.id,
      });

      // Step 1b: Update FTS vector (separate statement; cheap and idempotent).
      await setSearchVector(input.slug, {
        title: input.frontmatter.title,
        tags: input.frontmatter.tags,
        body: cleanBody,
      });

      // Step 2: Serialize + atomic file write.
      const serialized = serializeFrontmatter(fmObject, cleanBody);
      try {
        await writePostAtomically(POSTS_DIR, input.slug, serialized);
      } catch (err) {
        logger.error(
          { err, slug: input.slug, revisionId: revision.id },
          "posts.upsert: file write failed after revision was stored",
        );
        return {
          ok: false as const,
          revisionId: revision.id,
          warnings,
          error: `File write failed; revision ${revision.id} preserves the intended content.`,
        };
      }

      // Step 3: Schedule pagefind rebuild (no-op if dist/ is missing).
      schedulePagefindRebuild(input.slug);

      return {
        ok: true as const,
        revisionId: revision.id,
        order: meta.order,
        warnings,
      };
    },
  }),

  delete: defineAction({
    input: z.object({ slug: z.string().min(1) }),
    handler: async ({ slug }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      // Remove the RU source and its EN twin (`en/<slug>.md(x)`) — an orphaned
      // EN file would keep the deleted post alive at /en/blog/<slug>.
      const removed: string[] = [];
      for (const rel of [`${slug}.md`, `${slug}.mdx`, `en/${slug}.md`, `en/${slug}.mdx`]) {
        const target = resolveSafe(POSTS_DIR, rel);
        try {
          await unlink(target);
          removed.push(rel);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
      logger.info({ slug, removed }, "posts.delete: removed post files");
      await deleteMeta(slug);
      schedulePagefindRebuild(slug);
      return { ok: true as const };
    },
  }),

  search: defineAction({
    input: z.object({
      query: z.string().max(200),
    }),
    handler: async ({ query }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      const hits = await searchPostsMeta(query, 50);
      return { ok: true as const, hits };
    },
  }),
};
