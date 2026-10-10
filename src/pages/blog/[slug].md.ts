/**
 * Markdown twin of a prerendered post: /blog/<slug>.md
 *
 * Linked from the post's <head> via rel="alternate" type="text/markdown".
 * Not listed in the sitemap (it enumerates collections, not routes).
 *
 * Rendered on demand, not prerendered: the response must carry
 * `X-Robots-Tag: noindex` and `Link: <html url>; rel="canonical"`, and the
 * node adapter serves prerendered files with no custom headers. Those headers
 * let a search engine that already crawled a twin drop it in favour of the
 * HTML page; robots.txt deliberately leaves twins crawlable so the headers can
 * be seen. The canonical URL is also in the body's frontmatter for agents
 * (`canonical:` in src/lib/agents/markdown.ts). Unknown slugs answer 404.
 */
import type { APIRoute } from "astro";
import {
  findPostMarkdown,
  markdownFileResponse,
  markdownNotFoundResponse,
  postCanonicalUrl,
  renderPostMarkdown,
} from "~/lib/agents/documents";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const props = typeof params.slug === "string" ? await findPostMarkdown("ru", params.slug) : null;
  if (!props) return markdownNotFoundResponse(request, "ru");
  return markdownFileResponse(
    request,
    renderPostMarkdown(props, "ru"),
    postCanonicalUrl(props, "ru"),
  );
};
