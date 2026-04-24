import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "~/lib/db";
import { postsMeta } from "~/lib/db/schema";
import { reorderMeta, ensureMeta, deleteMeta } from "~/lib/db/repo/posts-meta";
import { appendRevision } from "~/lib/db/repo/revisions";
import { serializeFrontmatter } from "~/lib/content/frontmatter";
import { writePostAtomically } from "~/lib/fs/post-writer";
import { POSTS_DIR, resolveSafe } from "~/lib/fs/paths";

function assertAdmin(user: { role?: string | null } | null | undefined): void {
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
  }
}

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
    input: z.object({
      slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "invalid slug"),
      frontmatter: z.object({
        title: z.string().min(3).max(120),
        description: z.string().min(10).max(300),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        cover: z.string().optional(),
        coverAlt: z.string().optional(),
      }),
      body: z.string().default(""),
    }),
    handler: async (input, context) => {
      const user = context.locals.user as { id: string; role?: string | null } | null;
      assertAdmin(user);

      const meta = await ensureMeta(input.slug);

      const fmObject = {
        title: input.frontmatter.title,
        description: input.frontmatter.description,
        pubDate: input.frontmatter.pubDate,
        tags: input.frontmatter.tags,
        draft: input.frontmatter.draft,
        ...(input.frontmatter.updatedDate ? { updatedDate: input.frontmatter.updatedDate } : {}),
        ...(input.frontmatter.cover ? { cover: input.frontmatter.cover } : {}),
        ...(input.frontmatter.coverAlt ? { coverAlt: input.frontmatter.coverAlt } : {}),
      };

      // Step 1: DB transaction — insert revision.
      const revision = await appendRevision({
        slug: input.slug,
        frontmatter: fmObject,
        body: input.body,
        authorId: user!.id,
      });

      // Step 2: Serialize + atomic file write.
      const serialized = serializeFrontmatter(fmObject, input.body);
      try {
        await writePostAtomically(POSTS_DIR, input.slug, serialized);
      } catch (err) {
        return {
          ok: false as const,
          revisionId: revision.id,
          error: `File write failed; revision ${revision.id} preserves the intended content.`,
        };
      }

      return { ok: true as const, revisionId: revision.id, order: meta.order };
    },
  }),

  delete: defineAction({
    input: z.object({ slug: z.string().min(1) }),
    handler: async ({ slug }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      for (const ext of [".md", ".mdx"]) {
        const target = resolveSafe(POSTS_DIR, `${slug}${ext}`);
        try {
          await unlink(target);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
      await deleteMeta(slug);
      return { ok: true as const };
    },
  }),
};
