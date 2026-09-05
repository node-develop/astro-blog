/**
 * /llms-full.txt — batch retrieval artifact: author profile + full Markdown
 * bodies of every visible post (RU always full; EN full when the whole file
 * fits the 200 KB budget from the LLM-citable design spec, otherwise EN
 * excerpts — the file header states which mode was used).
 *
 * `X-Robots-Tag: noindex` stays on: this duplicates canonical HTML pages and
 * must not compete with them in web search. It is still fetchable by every
 * crawler (robots.txt allows it) so answer engines can read it.
 */
import type { APIContext } from "astro";
import { buildLlmsFull } from "~/lib/agents/llms";
import { loadLlmsInput } from "~/lib/agents/llms-data";

export const prerender = false;

export async function GET(_ctx: APIContext) {
  const digest = buildLlmsFull(await loadLlmsInput());
  return new Response(digest.text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex",
      "X-Llms-Full-Mode": digest.mode,
    },
  });
}
