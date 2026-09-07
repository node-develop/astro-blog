import type { APIRoute } from "astro";
import { openApiDocument } from "~/lib/content-api/openapi";
import { jsonResponse } from "~/lib/content-api/http";

export const prerender = false;
export const GET: APIRoute = () => jsonResponse(openApiDocument);
