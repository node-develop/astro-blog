/**
 * Phase 5 — repository functions for course_progress.
 *
 * Pure functional style per CLAUDE.md: no classes, no `this`. Each
 * function takes the DB instance from `~/lib/db` and returns Promises.
 *
 * Used by:
 *   - Astro Actions (src/actions/course-progress.ts)
 *   - Certificate endpoint (src/pages/courses/[course]/certificate.png.ts)
 */
import { and, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { courseProgress, type CourseProgressRow } from "~/lib/db/schema";

export const listProgressForUserAndCourse = async (
  userId: string,
  courseSlug: string,
): Promise<ReadonlyArray<CourseProgressRow>> => {
  return db
    .select()
    .from(courseProgress)
    .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseSlug, courseSlug)));
};

export const upsertProgress = async (params: {
  userId: string;
  courseSlug: string;
  lessonSlug: string;
  source: "auto" | "manual" | "import";
}): Promise<void> => {
  await db
    .insert(courseProgress)
    .values({
      userId: params.userId,
      courseSlug: params.courseSlug,
      lessonSlug: params.lessonSlug,
      source: params.source,
    })
    .onConflictDoNothing({
      target: [courseProgress.userId, courseProgress.courseSlug, courseProgress.lessonSlug],
    });
};

export const deleteProgress = async (params: {
  userId: string;
  courseSlug: string;
  lessonSlug: string;
}): Promise<void> => {
  await db
    .delete(courseProgress)
    .where(
      and(
        eq(courseProgress.userId, params.userId),
        eq(courseProgress.courseSlug, params.courseSlug),
        eq(courseProgress.lessonSlug, params.lessonSlug),
      ),
    );
};
