import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db } from "~/lib/db";
import { posts } from "~/lib/db/schema";
import { eq } from "drizzle-orm";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

export const server = {
  createPost: defineAction({
    accept: "form",
    input: z.object({
      title: z.string().min(3).max(120),
      description: z.string().min(10).max(200),
      contentMdx: z.string().min(10),
      tags: z.string().default(""),
      published: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user || (user.role !== "admin" && user.role !== "editor")) {
        throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
      }

      const tags = input.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const [created] = await db
        .insert(posts)
        .values({
          slug: slugify(input.title),
          title: input.title,
          description: input.description,
          contentMdx: input.contentMdx,
          tags,
          published: input.published,
          authorId: user.id,
          publishedAt: input.published ? new Date() : null,
        })
        .returning();

      if (!created)
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "insert failed" });
      return { id: created.id, slug: created.slug };
    },
  }),

  togglePublish: defineAction({
    accept: "form",
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const user = context.locals.user;
      if (!user || (user.role !== "admin" && user.role !== "editor")) {
        throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
      }
      const [post] = await db.select().from(posts).where(eq(posts.id, id));
      if (!post) throw new ActionError({ code: "NOT_FOUND", message: "post not found" });

      const nextPublished = !post.published;
      await db
        .update(posts)
        .set({
          published: nextPublished,
          publishedAt: nextPublished ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, id));

      return { published: nextPublished };
    },
  }),
};
