/**
 * Phase 5 — Astro Actions for course progress sync.
 *
 * Exposes three actions used by the client-side progress hook:
 *   - markComplete(courseSlug, lessonSlug, source)
 *   - markIncomplete(courseSlug, lessonSlug)
 *   - listCourse(courseSlug) → string[] of completed lesson slugs
 *
 * All gated on `ctx.locals.user` from the Better-Auth middleware. Anon
 * callers get a typed error (input invalid → fallback to localStorage
 * on the client, which already knows the user is signed-out via
 * body[data-auth]).
 *
 * Add this file to your existing actions index:
 *   // src/actions/index.ts
 *   import { courseProgress } from "./course-progress";
 *   export const server = { courseProgress };
 */
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import {
  listProgressForUserAndCourse,
  upsertProgress,
  deleteProgress,
} from "~/lib/db/repo/course-progress";

export const courseProgress = {
  markComplete: defineAction({
    accept: "json",
    input: z.object({
      courseSlug: z.string().min(1).max(100),
      lessonSlug: z.string().min(1).max(200),
      source: z.enum(["auto", "manual", "import"]).default("manual"),
    }),
    handler: async (input, ctx) => {
      const user = ctx.locals.user;
      if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
      await upsertProgress({
        userId: user.id,
        courseSlug: input.courseSlug,
        lessonSlug: input.lessonSlug,
        source: input.source,
      });
      return { ok: true } as const;
    },
  }),

  markIncomplete: defineAction({
    accept: "json",
    input: z.object({
      courseSlug: z.string().min(1).max(100),
      lessonSlug: z.string().min(1).max(200),
    }),
    handler: async (input, ctx) => {
      const user = ctx.locals.user;
      if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
      await deleteProgress({
        userId: user.id,
        courseSlug: input.courseSlug,
        lessonSlug: input.lessonSlug,
      });
      return { ok: true } as const;
    },
  }),

  listCourse: defineAction({
    accept: "json",
    input: z.object({ courseSlug: z.string().min(1).max(100) }),
    handler: async (input, ctx) => {
      const user = ctx.locals.user;
      if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
      const rows = await listProgressForUserAndCourse(user.id, input.courseSlug);
      return rows.map((r) => r.lessonSlug);
    },
  }),
};
