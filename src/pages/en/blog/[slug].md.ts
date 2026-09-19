/**
 * Markdown twin of a prerendered post: /en/blog/<slug>.md
 *
 * Linked from the post's <head> via rel="alternate" type="text/markdown".
 * Not listed in the sitemap (it enumerates collections, not routes). The HTTP
 * response carries only Content-Type — no X-Robots-Tag and no Link: rel=canonical.
 * The canonical HTML URL is written into the generated file's own frontmatter
 * (`canonical:` in src/lib/agents/markdown.ts), which agents read but search
 * engines do not. Ordinary search crawlers are kept off these twins by
 * `Disallow: /*.md$` in the catch-all group of public/robots.txt.
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
