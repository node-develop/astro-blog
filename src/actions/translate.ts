/**
 * `translate.one` — single-content translation triggered from the admin UI.
 *
 * Server-side wrapper around `translateOne()` (in `~/lib/translate/translate-one`).
 * The orchestrator handles read → decide → translate → write. This file just
 * gates on admin auth, validates input, and surfaces the result back to the
 * client.
 *
 * Sync (no background queue) because:
 *   - Single-post translate is ~2-15 seconds end-to-end on Haiku 4.5.
 *   - The admin UI shows a loading spinner; that's enough UX.
 *   - For batch translate we still recommend `pnpm translate` from the CLI.
 */
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { translateOne } from "~/lib/translate/translate-one";
import { assertAdmin } from "./_auth";

export const translate = {
  one: defineAction({
    input: z.object({
      collection: z.enum(["posts", "site", "projects", "courses", "lessons"]),
      slug: z.string().min(1).max(200),
      force: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ANTHROPIC_API_KEY is not configured",
        });
      }

      const result = await translateOne({
        collection: input.collection,
        slug: input.slug,
        apiKey,
        force: input.force,
      });

      if (result.status === "missing") {
        throw new ActionError({
          code: "NOT_FOUND",
          message: result.reason ?? "RU source not found",
        });
      }

      return {
        ok: true as const,
        status: result.status,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
        ...(result.enPath !== undefined ? { enPath: result.enPath } : {}),
        ...(result.sourceHash !== undefined ? { sourceHash: result.sourceHash } : {}),
      };
    },
  }),
};
