/**
 * Agent-readable Markdown twins for prerendered content (posts, lessons).
 *
 * Posts and lessons are static HTML, so the Accept-negotiation used by the
 * SSR routes (home, blog index, 404) cannot apply. Instead each page gets a
 * sibling `<slug>.md` file, advertised via `<link rel="alternate"
 * type="text/markdown">`, that carries the canonical URL in its header.
 *
 * Shared by src/pages/{,en/}blog/[slug].md.ts and
 * src/pages/{,en/}courses/[course]/[lesson].md.ts.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { person } from "~/lib/seo/person";
import { canonicalUrl } from "~/lib/seo/url-policy";
import { renderDocumentMarkdown } from "./markdown";

type AgentLocale = "ru" | "en";
type Post = CollectionEntry<"posts">;
type Course = CollectionEntry<"course">;
type Lesson = CollectionEntry<"lesson">;

const localePrefix = (locale: AgentLocale): string => (locale === "en" ? "/en" : "");
const bareSlug = (id: string): string => id.replace(/^en\//, "");

// Same visibility rule as src/pages/blog/[...slug].astro: every non-draft
// post of the locale, straight from the collection (no DB curation).
export const listMarkdownPosts = async (locale: AgentLocale): Promise<readonly Post[]> =>
  getCollection(
    "posts",
    (entry: Post) =>
      !entry.data.draft &&
      (locale === "en" ? entry.id.startsWith("en/") : !entry.id.startsWith("en/")),
  );

export interface PostMarkdownProps {
  readonly post: Post;
  /** Whether the other-locale twin exists (drives the `alternate:` header line). */
  readonly hasTwin: boolean;
}

export const postMarkdownPaths = async (
  locale: AgentLocale,
): Promise<ReadonlyArray<{ params: { slug: string }; props: PostMarkdownProps }>> => {
  const [posts, twins] = await Promise.all([
    listMarkdownPosts(locale),
    listMarkdownPosts(locale === "en" ? "ru" : "en"),
  ]);
  const twinSlugs = new Set(twins.map((p) => bareSlug(p.id)));
  return posts.map((post) => ({
    params: { slug: bareSlug(post.id) },
    props: { post, hasTwin: twinSlugs.has(bareSlug(post.id)) },
  }));
};

export const renderPostMarkdown = (
  { post, hasTwin }: PostMarkdownProps,
  locale: AgentLocale,
): string => {
  const slug = bareSlug(post.id);
  const twinLocale: AgentLocale = locale === "en" ? "ru" : "en";
  return renderDocumentMarkdown({
    locale,
    title: post.data.title,
    description: post.data.description,
    canonical: canonicalUrl(`${localePrefix(locale)}/blog/${slug}/`),
    alternate: hasTwin ? canonicalUrl(`${localePrefix(twinLocale)}/blog/${slug}/`) : null,
    author: post.data.author || person.name,
    pubDate: post.data.pubDate,
    updatedDate: post.data.updatedDate ?? null,
    tags: post.data.tags,
    body: post.body ?? "",
  });
};

const courseSlugOf = (course: Course): string => course.id.replace(/(?:\/en)?\/_index$/, "");
const lessonSlugOf = (lesson: Lesson): string => lesson.id.replace(/^.*\//, "");
const lessonOrder = (lesson: Lesson): number =>
  lesson.data.order ?? parseInt(lesson.id.match(/(\d+)/)?.[1] ?? "0", 10);

export interface LessonMarkdownProps {
  readonly course: Course;
  readonly lesson: Lesson;
  readonly position: number;
  readonly total: number;
}

export const lessonMarkdownPaths = async (
  locale: AgentLocale,
): Promise<
  ReadonlyArray<{ params: { course: string; lesson: string }; props: LessonMarkdownProps }>
> => {
  const [courses, lessons] = await Promise.all([
    getCollection(
      "course",
      (c: Course) => c.data.status !== "draft" && (c.data.locale === "en") === (locale === "en"),
    ),
    getCollection("lesson", (l: Lesson) => (l.data.locale === "en") === (locale === "en")),
  ]);
  return courses.flatMap((course: Course) => {
    const courseSlug = courseSlugOf(course);
    const ordered = lessons
      .filter((l: Lesson) => l.id.startsWith(`${courseSlug}/`))
      .sort((a: Lesson, b: Lesson) => lessonOrder(a) - lessonOrder(b));
    return ordered.map((lesson: Lesson, index: number) => ({
      params: { course: courseSlug, lesson: lessonSlugOf(lesson) },
      props: { course, lesson, position: index + 1, total: ordered.length },
    }));
  });
};

export const renderLessonMarkdown = (
  { course, lesson, position, total }: LessonMarkdownProps,
  locale: AgentLocale,
): string => {
  const prefix = localePrefix(locale);
  const courseSlug = courseSlugOf(course);
  const courseCanonical = canonicalUrl(`${prefix}/courses/${courseSlug}/`);
  return renderDocumentMarkdown({
    locale,
    title: lesson.data.title,
    description: lesson.data.blurb ?? course.data.blurb,
    canonical: canonicalUrl(`${prefix}/courses/${courseSlug}/${lessonSlugOf(lesson)}/`),
    author: person.name,
    pubDate: lesson.data.pubDate,
    tags: course.data.tags,
    extra: [
      ["course", JSON.stringify(course.data.title)],
      ["courseUrl", courseCanonical],
      ["lesson", `${position} of ${total}`],
    ],
    body: lesson.body ?? "",
  });
};

export const markdownFileResponse = (body: string): Response =>
  new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
