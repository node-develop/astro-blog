/**
 * /llms.txt — llmstxt.org index. Generated at request time so it lists every
 * currently visible post (same DB-curated set as the blog index), the EN
 * twins and the course lessons; the former static public/llms.txt drifted
 * (it claimed sitemap hreflang and a "full" digest that were not true).
 */
import type { APIContext } from "astro";
import { buildLlmsTxt } from "~/lib/agents/llms";
import { loadLlmsInput } from "~/lib/agents/llms-data";

export const prerender = false;

export async function GET(_ctx: APIContext) {
  const body = buildLlmsTxt(await loadLlmsInput());
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
