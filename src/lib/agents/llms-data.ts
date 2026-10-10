/**
 * Loads the runtime data behind /llms.txt and /llms-full.txt.
 * Posts come from getOrderedPosts (DB-curated visibility, same as the blog
 * index).
 */
import type { CollectionEntry } from "astro:content";
import { getOrderedPosts } from "~/lib/content/loader";
import type { LlmsInput, LlmsPost } from "./llms";

const toPost = (entry: CollectionEntry<"posts">): LlmsPost => ({
  slug: entry.id.replace(/^en\//, "").replace(/\.(md|mdx)$/, ""),
  title: entry.data.title,
  description: entry.data.description,
  pubDate: entry.data.pubDate,
  updatedDate: entry.data.updatedDate ?? null,
  tags: entry.data.tags,
  body: entry.body ?? "",
});

export const loadLlmsInput = async (): Promise<LlmsInput> => {
  const [ru, en] = await Promise.all([
    getOrderedPosts({ locale: "ru" }),
    getOrderedPosts({ locale: "en" }),
  ]);
  return {
    ruPosts: ru.map((p) => toPost(p.entry)),
    enPosts: en.map((p) => toPost(p.entry)),
  };
};
