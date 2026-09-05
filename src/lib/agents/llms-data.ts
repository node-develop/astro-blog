/**
 * Loads the runtime data behind /llms.txt and /llms-full.txt.
 * Posts come from getOrderedPosts (DB-curated visibility, same as the blog
 * index); lessons straight from the collection in course order.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { getOrderedPosts } from "~/lib/content/loader";
import type { LlmsInput, LlmsLesson, LlmsPost } from "./llms";

type Course = CollectionEntry<"course">;
type Lesson = CollectionEntry<"lesson">;

const toPost = (entry: CollectionEntry<"posts">): LlmsPost => ({
  slug: entry.id.replace(/^en\//, "").replace(/\.(md|mdx)$/, ""),
  title: entry.data.title,
  description: entry.data.description,
  pubDate: entry.data.pubDate,
  updatedDate: entry.data.updatedDate ?? null,
  tags: entry.data.tags,
  body: entry.body ?? "",
});

const lessonOrder = (lesson: Lesson): number =>
  lesson.data.order ?? parseInt(lesson.id.match(/(\d+)/)?.[1] ?? "0", 10);

const lessonsFor = async (locale: "ru" | "en"): Promise<readonly LlmsLesson[]> => {
  const isEn = locale === "en";
  const [courses, lessons] = await Promise.all([
    getCollection(
      "course",
      (c: Course) => c.data.status !== "draft" && (c.data.locale === "en") === isEn,
    ),
    getCollection("lesson", (l: Lesson) => (l.data.locale === "en") === isEn),
  ]);
  return courses.flatMap((course: Course) => {
    const courseSlug = course.id.replace(/(?:\/en)?\/_index$/, "");
    return lessons
      .filter((l: Lesson) => l.id.startsWith(`${courseSlug}/`))
      .sort((a: Lesson, b: Lesson) => lessonOrder(a) - lessonOrder(b))
      .map((lesson: Lesson, index: number) => ({
        courseSlug,
        courseTitle: course.data.title,
        slug: lesson.id.replace(/^.*\//, ""),
        title: lesson.data.title,
        description: lesson.data.blurb ?? course.data.blurb,
        position: index + 1,
      }));
  });
};

export const loadLlmsInput = async (): Promise<LlmsInput> => {
  const [ru, en, ruLessons, enLessons] = await Promise.all([
    getOrderedPosts({ locale: "ru" }),
    getOrderedPosts({ locale: "en" }),
    lessonsFor("ru"),
    lessonsFor("en"),
  ]);
  return {
    ruPosts: ru.map((p) => toPost(p.entry)),
    enPosts: en.map((p) => toPost(p.entry)),
    ruLessons,
    enLessons,
  };
};
