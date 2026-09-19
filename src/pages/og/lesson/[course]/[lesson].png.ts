/**
 * Static OG-image route for course lessons: one PNG per lesson per locale at
 * `/og/lesson/<course>/<lesson>-<locale>.png` (shape owned by
 * `lessonOgPath()` in src/lib/og/lesson-pages.ts).
 *
 * Course/lesson resolution mirrors the two page routes
 * (`src/pages/courses/[course]/[lesson].astro` and its `en/` twin): locale
 * comes from frontmatter, the EN course lives at `<course>/en/_index` with
 * its lessons under `<course>/en/`, and position is the 1-based index inside
 * the locale's ordered lesson list — the same number the page header shows.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import type { Locale } from "~/i18n";
import { renderOg } from "~/lib/og/og-image";
import { lessonOgEyebrow, lessonOgSlug } from "~/lib/og/lesson-pages";

const isEnglish = (entry: CollectionEntry<"course"> | CollectionEntry<"lesson">): boolean =>
  entry.data.locale === "en";

const orderOf = (lesson: CollectionEntry<"lesson">): number =>
  lesson.data.order ?? parseInt(lesson.id.match(/(\d+)/)?.[1] ?? "0", 10);

const courseSlugOf = (course: CollectionEntry<"course">, locale: Locale): string =>
  locale === "en" ? course.id.replace(/\/en\/?_index$/, "") : course.id.replace(/\/?_index$/, "");

export const getStaticPaths: GetStaticPaths = async () => {
  const courses = await getCollection("course");
  const lessons = await getCollection("lesson");

  const paths: Array<{
    params: { course: string; lesson: string };
    props: { title: string; eyebrow: string };
  }> = [];
  // Same fail-loud guard as the post route: a card silently taken over by
  // another lesson is exactly the kind of wrong-but-successful build this
  // repo refuses to ship.
  const claimedBy = new Map<string, string>();

  for (const locale of ["ru", "en"] as const) {
    const wantEnglish = locale === "en";

    for (const course of courses.filter(
      (c: CollectionEntry<"course">) => isEnglish(c) === wantEnglish,
    )) {
      const courseSlug = courseSlugOf(course, locale);
      const prefix = wantEnglish ? `${courseSlug}/en/` : `${courseSlug}/`;
      const ordered = lessons
        .filter(
          (l: CollectionEntry<"lesson">) => isEnglish(l) === wantEnglish && l.id.startsWith(prefix),
        )
        .sort(
          (a: CollectionEntry<"lesson">, b: CollectionEntry<"lesson">) => orderOf(a) - orderOf(b),
        );

      ordered.forEach((lesson: CollectionEntry<"lesson">, i: number) => {
        const params = {
          course: courseSlug,
          lesson: lessonOgSlug(lesson.id.replace(/^.*\//, ""), locale),
        };
        const key = `${params.course}/${params.lesson}`;
        const clash = claimedBy.get(key);
        if (clash !== undefined) {
          throw new Error(
            `[og] lesson image path collision at /og/lesson/${key}.png: claimed by both ` +
              `"${clash}" and "${lesson.id}". One lesson card would carry another lesson's ` +
              `title and language. Rename one lesson file, or change lessonOgSlug() in ` +
              `src/lib/og/lesson-pages.ts to a shape that cannot collide.`,
          );
        }
        claimedBy.set(key, lesson.id);

        paths.push({
          params,
          props: {
            title: lesson.data.title,
            eyebrow: lessonOgEyebrow({
              locale,
              index: i + 1,
              courseTitle: course.data.title,
            }),
          },
        });
      });
    }
  }

  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow: string };
  const png = await renderOg({ title, eyebrow });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
