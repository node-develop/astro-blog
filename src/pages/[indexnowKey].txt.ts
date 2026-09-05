/**
 * IndexNow key verification: GET /<INDEXNOW_KEY>.txt → the key itself.
 * Anything else under /<x>.txt is a 404 (static .txt files in public/ and the
 * llms*.txt routes are matched before this dynamic route).
 */
import type { APIRoute } from "astro";
import { indexNowKeyFromEnv } from "~/lib/seo/indexnow";

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const key = indexNowKeyFromEnv();
  if (key === null || params.indexnowKey !== key) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
