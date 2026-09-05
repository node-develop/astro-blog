import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { listRevisionsBySlug, getRevision, appendRevision } from "~/lib/db/repo/revisions";
import { serializeFrontmatter, type Frontmatter } from "~/lib/content/frontmatter";
import { writePostAtomically } from "~/lib/fs/post-writer";
import { POSTS_DIR } from "~/lib/fs/paths";
import { assertAdmin } from "./_auth";

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

      // Create a new revision from the old snapshot (audit trail).
      await appendRevision({
        slug: rev.slug,
        frontmatter: rev.frontmatter,
        body: rev.body,
        authorId: user!.id,
      });

      // Coerce stored JSONB to Frontmatter and write the file.
      const fm = toFrontmatter(rev.frontmatter);
      const serialized = serializeFrontmatter(fm, rev.body);
      await writePostAtomically(POSTS_DIR, rev.slug, serialized);
      return { ok: true as const };
    },
  }),
};

function toFrontmatter(raw: unknown): Frontmatter {
  const r = raw as Record<string, unknown>;
  const pubDate = new Date(String(r["pubDate"]));
  if (Number.isNaN(pubDate.getTime())) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "stored frontmatter has invalid pubDate",
    });
  }
  const base: Frontmatter = {
    title: String(r["title"] ?? ""),
    description: String(r["description"] ?? ""),
    pubDate,
    tags: Array.isArray(r["tags"]) ? r["tags"].map(String) : [],
    draft: Boolean(r["draft"] ?? false),
    ...(r["updatedDate"] !== undefined ? { updatedDate: new Date(String(r["updatedDate"])) } : {}),
    ...(typeof r["cover"] === "string" ? { cover: r["cover"] } : {}),
    ...(typeof r["coverAlt"] === "string" ? { coverAlt: r["coverAlt"] } : {}),
  };
  return base;
}
