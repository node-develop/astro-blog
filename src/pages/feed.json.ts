import type { APIContext } from "astro";
import { buildJsonFeed } from "~/lib/feeds/build-json-feed";

export const GET = (context: APIContext) =>
  buildJsonFeed({ site: context.site ?? "http://localhost:4321", locale: "ru" });
