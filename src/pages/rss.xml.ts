import rss from "@astrojs/rss";
import { getCollection, type CollectionEntry } from "astro:content";
import type { APIContext } from "astro";

type Post = CollectionEntry<"posts">;

export async function GET(context: APIContext) {
  const posts: Post[] = await getCollection("posts", (entry: Post) => !entry.data.draft);
  return rss({
    title: "Personal Blog",
    description: "Свежие публикации",
    site: context.site ?? "http://localhost:4321",
    items: posts
      .sort((a: Post, b: Post) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .map((post: Post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link: `/blog/${post.id}`,
      })),
  });
}
