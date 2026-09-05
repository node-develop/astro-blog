/**
 * Markdown twin of a prerendered lesson: /en/courses/<course>/<lesson>.md
 * See src/pages/blog/[slug].md.ts for the rationale.
 */
import type { APIRoute } from "astro";
import {
  lessonMarkdownPaths,
  markdownFileResponse,
  renderLessonMarkdown,
  type LessonMarkdownProps,
} from "~/lib/agents/documents";

export const prerender = true;

export const getStaticPaths = () => lessonMarkdownPaths("en");

export const GET: APIRoute = ({ props }) =>
  markdownFileResponse(renderLessonMarkdown(props as LessonMarkdownProps, "en"));
