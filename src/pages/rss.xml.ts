import type { APIContext } from "astro";
import { buildRssFeed } from "~/lib/feeds/build-rss";

export const GET = (context: APIContext) =>
  buildRssFeed({ site: context.site ?? "http://localhost:4321", locale: "ru" });
