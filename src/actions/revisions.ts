import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { listRevisionsBySlug, getRevision, appendRevision } from "~/lib/db/repo/revisions";
import { setSearchVector } from "~/lib/db/repo/posts-meta";
import { serializeFrontmatter, type Frontmatter } from "~/lib/content/frontmatter";
import { writePostAtomically } from "~/lib/fs/post-writer";
import { POSTS_DIR } from "~/lib/fs/paths";
import { logger } from "~/lib/logger";
import { schedulePagefindRebuild } from "~/lib/search/pagefind-rebuild";
import { assertAdmin } from "./_auth";
import { postUpsertInput, toPostFrontmatter } from "./posts";

/**
 * Coerces a stored revision's JSONB frontmatter into the on-disk
 * `Frontmatter`, via the SAME zod schema and builder that `posts.upsert`
 * uses. Exported for unit tests.
 *
 * Throws when the snapshot no longer satisfies the current schema (limits
 * tightened since it was stored): a restored file that fails the
 * content-collection schema would break the next build, so fail loud here.
 */
export const frontmatterFromRevision = (raw: unknown): Frontmatter => {
  const parsed = postUpsertInput.shape.frontmatter.safeParse(raw);
  if (!parsed.success) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `stored frontmatter does not satisfy the post schema: ${parsed.error.message}`,
    });
  }
  return toPostFrontmatter(parsed.data);
};

export const revisions = {
  list: defineAction({
    input: z.object({ slug: z.string().min(1) }),
    handler: async ({ slug }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      return { items: await listRevisionsBySlug(slug) };
    },
  }),

  restore: defineAction({
    input: z.object({ revisionId: z.number().int().positive() }),
    handler: async ({ revisionId }, context) => {
      const user = context.locals.user as { id: string; role?: string | null } | null;
      assertAdmin(user);
      const rev = await getRevision(revisionId);
      if (!rev) {
        throw new ActionError({ code: "NOT_FOUND", message: "Revision not found" });
      }

      // Validate BEFORE touching the DB so a bad snapshot leaves no half-applied state.
      const fm = frontmatterFromRevision(rev.frontmatter);

      // Same write path as posts.upsert: revision (audit trail) → FTS vector
      // → atomic file write → pagefind rebuild.
      const revision = await appendRevision({
        slug: rev.slug,
        frontmatter: fm,
        body: rev.body,
        authorId: user!.id,
      });

      await setSearchVector(rev.slug, { title: fm.title, tags: fm.tags, body: rev.body });

      const serialized = serializeFrontmatter(fm, rev.body);
      try {
        await writePostAtomically(POSTS_DIR, rev.slug, serialized);
      } catch (err) {
        logger.error(
          { err, slug: rev.slug, revisionId: revision.id, restoredFrom: revisionId },
          "revisions.restore: file write failed after revision was stored",
        );
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `File write failed; revision ${revision.id} preserves the intended content.`,
        });
      }

      schedulePagefindRebuild(rev.slug);
      return { ok: true as const, revisionId: revision.id };
    },
  }),
};
