/**
 * Markdown twin of a prerendered lesson: /en/courses/<course>/<lesson>.md
 * Rendered on demand for its noindex + canonical headers; see
 * src/pages/blog/[slug].md.ts for the rationale. Unknown lessons answer 404.
 */
import type { APIRoute } from "astro";
import {
  findLessonMarkdown,
  lessonCanonicalUrl,
  markdownFileResponse,
  markdownNotFoundResponse,
  renderLessonMarkdown,
} from "~/lib/agents/documents";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const props =
    typeof params.course === "string" && typeof params.lesson === "string"
      ? await findLessonMarkdown("en", params.course, params.lesson)
      : null;
  if (!props) return markdownNotFoundResponse(request, "en");
  return markdownFileResponse(
    request,
    renderLessonMarkdown(props, "en"),
    lessonCanonicalUrl(props, "en"),
  );
};
