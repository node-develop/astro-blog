import type { APIRoute } from "astro";
import { auth } from "~/lib/auth";

export const prerender = false;

/**
 * Better-Auth matches routes against `basePath` + path and does not tolerate
 * a trailing slash, while this site enforces `trailingSlash: "always"` — Astro
 * 301s `/api/auth/sign-in/email` to `/api/auth/sign-in/email/` (a browser then
 * replays a POST as GET) and the slash variant used to 404 inside Better-Auth.
 * Hand Better-Auth the slash-less URL; the response is passed through as is.
 */
const stripTrailingSlash = (request: Request): Request => {
  const url = new URL(request.url);
  if (url.pathname.length <= 1 || !url.pathname.endsWith("/")) return request;
  url.pathname = url.pathname.slice(0, -1);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
    ...(request.body ? { duplex: "half" } : {}),
  };
  return new Request(url, init);
};

export const ALL: APIRoute = async ({ request }) => auth.handler(stripTrailingSlash(request));
