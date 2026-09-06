import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { writeSiteToDisk } from "~/lib/content/site-io";
import { SITE_DIR } from "~/lib/fs/paths";
import { assertAdmin } from "./_auth";

export const site = {
  update: defineAction({
    input: z.object({
      slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "invalid slug"),
      title: z.string().min(3).max(120),
      body: z.string().default(""),
    }),
    handler: async ({ slug, title, body }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      if (slug === "home") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Use home.update for the home page",
        });
      }

      // Read-merge-write: keeps description / sourceHash / manuallyEdited etc.
      try {
        await writeSiteToDisk(SITE_DIR, slug, { title, body });
      } catch (err) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `File write failed: ${String(err)}`,
        });
      }

      return { ok: true as const };
    },
  }),
};
