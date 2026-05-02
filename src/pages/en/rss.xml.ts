import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getOrderedPosts } from "~/lib/content/loader";

export async function GET(context: APIContext) {
  const posts = await getOrderedPosts({ locale: "en" });
  return rss({
    title: "Personal Blog (EN)",
    description: "Latest posts",
    site: context.site ?? "http://localhost:4321",
    customData: `<language>en-US</language><copyright>© ${new Date().getFullYear()} artka.dev</copyright>`,
    items: [...posts]
      .sort((a, b) => b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime())
      .map((p) => ({
        title: p.entry.data.title,
        description: p.entry.data.description,
        pubDate: p.entry.data.pubDate,
        // Strip "en/" prefix from content collection id to get bare slug
        link: `/en/blog/${p.entry.id.replace(/^en\//, "")}`,
        author: `a@artka.dev (${p.entry.data.author})`,
        categories: p.entry.data.tags,
      })),
  });
}
