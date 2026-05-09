import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { dump } from "js-yaml";
import { writePostAtomically } from "~/lib/fs/post-writer";
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

      const fm = `---\n${dump({ title })}---\n\n${body}`;

      try {
        await writePostAtomically(SITE_DIR, slug, fm);
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
