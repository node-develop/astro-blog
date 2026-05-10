import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      commit: process.env.GIT_SHA ?? "unknown",
      builtAt: process.env.BUILT_AT ?? "unknown",
      node: process.version,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
