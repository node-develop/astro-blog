import type { APIRoute } from "astro";
import { buildLocaleSitemapResponse } from "~/lib/seo/sitemap";

export const GET: APIRoute = async () => buildLocaleSitemapResponse("ru");
