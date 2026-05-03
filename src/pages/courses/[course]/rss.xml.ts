/**
 * Per-course RSS feed: /courses/<slug>/rss.xml
 *
 * Lists lessons in publish order with absolute URLs. Uses @astrojs/rss
 * (already a dep from the main blog feed). Static at build time.
 */
import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export const prerender = true;

export const getStaticPaths = async () => {
  const courses = await getCollection(
    "course",
    (c: CollectionEntry<"course">) => c.data.status !== "draft" && c.data.locale !== "en",
  );
  return courses.map((c: CollectionEntry<"course">) => ({
    params: { course: c.id.replace(/\/?_index$/, "") },
  }));
};

export const GET: APIRoute = async ({ params, site }) => {
  const courseSlug = params.course;
  if (!courseSlug || typeof courseSlug !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const course = await getEntry("course", `${courseSlug}/_index`);
  if (!course) return new Response("Not found", { status: 404 });

  const lessons = await getCollection("lesson", (l: CollectionEntry<"lesson">) =>
    l.id.startsWith(`${courseSlug}/`),
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
      `Уроки курса "${course.data.title}". Новые уроки появляются по мере публикации.`,
    site: site ?? "https://artka.dev",
    items: ordered.map((lesson) => ({
      title: lesson.data.title,
      description: lesson.data.blurb ?? "",
      link: `/courses/${courseSlug}/${lesson.id.split("/").pop()}/`,
      pubDate: lesson.data.pubDate ?? course.data.pubDate ?? new Date(),
    })),
    customData: `<language>${course.data.locale ?? "ru"}</language>`,
  });
};
