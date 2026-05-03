/**
 * Per-course RSS feed (EN): /en/courses/<slug>/rss.xml
 */
import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export const prerender = true;

export const getStaticPaths = async () => {
  const enCoursePathToSlug = (id: string): string => id.replace(/\/en\/?_index$/, "");

  const courses = await getCollection(
    "course",
    (c: CollectionEntry<"course">) => c.data.status !== "draft" && c.data.locale === "en",
  );
  return courses.map((c: CollectionEntry<"course">) => ({
    params: { course: enCoursePathToSlug(c.id) },
  }));
};

export const GET: APIRoute = async ({ params, site }) => {
  const courseSlug = params.course;
  if (!courseSlug || typeof courseSlug !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const course = await getEntry("course", `${courseSlug}/en/_index`);
  if (!course) return new Response("Not found", { status: 404 });

  const lessons = await getCollection("lesson", (l: CollectionEntry<"lesson">) =>
    l.id.startsWith(`${courseSlug}/en/`),
  );

  const ordered = [...lessons].sort((a, b) => {
    const ao = a.data.order ?? 0;
    const bo = b.data.order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });

  return rss({
    title: `artka.dev — ${course.data.title}`,
    description:
      course.data.blurb ??
      `Lessons from "${course.data.title}". New lessons appear as they are published.`,
    site: site ?? "https://artka.dev",
    items: ordered.map((lesson) => ({
      title: lesson.data.title,
      description: lesson.data.blurb ?? "",
      link: `/en/courses/${courseSlug}/${lesson.id.split("/").pop()}/`,
      pubDate: lesson.data.pubDate ?? course.data.pubDate ?? new Date(),
    })),
    customData: `<language>en</language>`,
  });
};
