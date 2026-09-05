/**
 * Markdown twin of a prerendered post: /en/blog/<slug>.md
 *
 * Linked from the post's <head> via rel="alternate" type="text/markdown".
 * Not listed in the sitemap (it enumerates collections, not routes); the
 * header carries the canonical HTML URL so direct fetches still cite the page.
 */
import type { APIRoute } from "astro";
import {
  markdownFileResponse,
  postMarkdownPaths,
  renderPostMarkdown,
  type PostMarkdownProps,
} from "~/lib/agents/documents";

export const prerender = true;

export const getStaticPaths = () => postMarkdownPaths("en");

export const GET: APIRoute = ({ props }) =>
  markdownFileResponse(renderPostMarkdown(props as PostMarkdownProps, "en"));
