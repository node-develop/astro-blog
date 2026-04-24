import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { reorderMeta } from "~/lib/db/repo/posts-meta";

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
};
