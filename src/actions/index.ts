import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db } from "~/lib/db";
import { postsMeta, postRevisions } from "~/lib/db/schema";

export const server = {
  upsertPostMeta: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string().min(1).max(200),
      order: z.coerce.number().int().nonnegative(),
      pinned: z.boolean().default(false),
      hiddenFromList: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || (user.role !== "admin" && user.role !== "editor")) {
        throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
      }

      await db
        .insert(postsMeta)
        .values({
          slug: input.slug,
          order: input.order,
          pinned: input.pinned,
          hiddenFromList: input.hiddenFromList,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: postsMeta.slug,
          set: {
            order: input.order,
            pinned: input.pinned,
            hiddenFromList: input.hiddenFromList,
            updatedAt: new Date(),
          },
        });

      return { slug: input.slug };
    },
  }),

  createRevision: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string().min(1).max(200),
      frontmatter: z.string().min(2), // JSON string
      body: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || (user.role !== "admin" && user.role !== "editor")) {
        throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
      }

      let frontmatter: unknown;
      try {
        frontmatter = JSON.parse(input.frontmatter);
      } catch {
        throw new ActionError({ code: "BAD_REQUEST", message: "frontmatter must be valid JSON" });
      }

      const [revision] = await db
        .insert(postRevisions)
        .values({
          slug: input.slug,
          frontmatter,
          body: input.body,
          authorId: user.id,
        })
        .returning();

      if (!revision)
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "insert failed" });

      return { id: revision.id, slug: revision.slug };
    },
  }),
};
