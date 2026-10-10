/**
 * Agent-readable Markdown twins for prerendered content (posts, lessons).
 *
 * Posts and lessons are static HTML, so the Accept-negotiation used by the
 * SSR routes (home, 404) cannot apply. Instead each page gets a sibling
 * `<slug>.md` address, advertised via `<link rel="alternate"
 * type="text/markdown">`, that carries the canonical URL in its header.
 *
 * The twins are rendered on demand rather than prerendered: a static file
 * served by the node adapter cannot carry custom headers, and every twin has
 * to answer with `X-Robots-Tag: noindex` plus `Link: <html>; rel="canonical"`
 * so a search engine that crawled one can drop it in favour of the HTML page
 * (robots.txt no longer blocks them, otherwise the header would never be seen).
 *
 * Shared by src/pages/{,en/}blog/[slug].md.ts and
 * src/pages/{,en/}courses/[course]/[lesson].md.ts.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { applyPublicHtmlCache } from "~/lib/http/public-cache";
import { person } from "~/lib/seo/person";
import { canonicalUrl } from "~/lib/seo/url-policy";
import { renderAgent404Markdown, renderDocumentMarkdown } from "./markdown";

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

/** Props of the twin at `/<locale>/blog/<slug>.md`, or null when no such post is built. */
export const findPostMarkdown = async (
  locale: AgentLocale,
  slug: string,
): Promise<PostMarkdownProps | null> =>
  (await postMarkdownPaths(locale)).find((path) => path.params.slug === slug)?.props ?? null;

/** Canonical HTML URL of the page a post twin duplicates. */
export const postCanonicalUrl = ({ post }: PostMarkdownProps, locale: AgentLocale): string =>
  canonicalUrl(`${localePrefix(locale)}/blog/${bareSlug(post.id)}/`);

export const renderPostMarkdown = (props: PostMarkdownProps, locale: AgentLocale): string => {
  const { post, hasTwin } = props;
  const slug = bareSlug(post.id);
  const twinLocale: AgentLocale = locale === "en" ? "ru" : "en";
  return renderDocumentMarkdown({
    locale,
    title: post.data.title,
    description: post.data.description,
    canonical: postCanonicalUrl(props, locale),
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

/** Props of the twin at `/<locale>/courses/<course>/<lesson>.md`, or null when not built. */
export const findLessonMarkdown = async (
  locale: AgentLocale,
  courseSlug: string,
  lessonSlug: string,
): Promise<LessonMarkdownProps | null> =>
  (await lessonMarkdownPaths(locale)).find(
    (path) => path.params.course === courseSlug && path.params.lesson === lessonSlug,
  )?.props ?? null;

/** Canonical HTML URL of the page a lesson twin duplicates. */
export const lessonCanonicalUrl = (
  { course, lesson }: LessonMarkdownProps,
  locale: AgentLocale,
): string =>
  canonicalUrl(`${localePrefix(locale)}/courses/${courseSlugOf(course)}/${lessonSlugOf(lesson)}/`);

export const renderLessonMarkdown = (props: LessonMarkdownProps, locale: AgentLocale): string => {
  const { course, lesson, position, total } = props;
  const prefix = localePrefix(locale);
  const courseSlug = courseSlugOf(course);
  const courseCanonical = canonicalUrl(`${prefix}/courses/${courseSlug}/`);
  return renderDocumentMarkdown({
    locale,
    title: lesson.data.title,
    description: lesson.data.blurb ?? course.data.blurb,
    canonical: lessonCanonicalUrl(props, locale),
    author: person.name,
    pubDate: lesson.data.pubDate,
    updatedDate: lesson.data.updatedDate,
    tags: course.data.tags,
    extra: [
      ["course", JSON.stringify(course.data.title)],
      ["courseUrl", courseCanonical],
      ["lesson", `${position} of ${total}`],
    ],
    body: lesson.body ?? "",
  });
};

/**
 * Response for a Markdown twin. `X-Robots-Tag: noindex` plus the canonical
 * `Link` header tell a search engine the twin is a duplicate of `canonical`
 * (the HTML page), so it is dropped from the index instead of competing with
 * it. Anonymous requests share the SSR HTML cache policy.
 */
export const markdownFileResponse = (
  request: Request,
  body: string,
  canonical: string,
): Response => {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Robots-Tag": "noindex",
    Link: `<${canonical}>; rel="canonical"`,
  });
  applyPublicHtmlCache(request, headers);
  return new Response(request.method === "HEAD" ? null : body, { headers });
};

/**
 * 404 for a twin address that matches no built post or lesson: the same agent
 * recovery page src/pages/404.astro sends to a Markdown client, since whoever
 * asks for a `.md` URL wants Markdown back. Not cacheable, so a twin published
 * later is not hidden behind a stored miss.
 */
export const markdownNotFoundResponse = (request: Request, locale: AgentLocale): Response =>
  new Response(
    request.method === "HEAD"
      ? null
      : renderAgent404Markdown(locale, new URL(request.url).pathname),
    {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
