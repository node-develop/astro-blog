import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getOrderedPosts } from "~/lib/content/loader";

export async function GET(context: APIContext) {
  const posts = await getOrderedPosts({ locale: "ru" });
  return rss({
    title: "Personal Blog",
    description: "Свежие публикации",
    site: context.site ?? "http://localhost:4321",
    customData: `<language>ru-RU</language><copyright>© ${new Date().getFullYear()} artka.dev</copyright>`,
    items: [...posts]
      .sort((a, b) => b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime())
      .map((p) => ({
        title: p.entry.data.title,
        description: p.entry.data.description,
        pubDate: p.entry.data.pubDate,
        link: `/blog/${p.entry.id.replace(/^en\//, "")}`,
        author: `a@artka.dev (${p.entry.data.author})`,
        categories: p.entry.data.tags,
      })),
  });
}
