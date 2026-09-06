/**
 * Usage: pnpm social:smoke <slug>
 *
 * Runs the pipeline (Writer → Editor → Critic) against a post and prints the
 * resulting drafts to stdout. Does NOT touch the DB and does NOT post to
 * social media. Reads markdown directly from src/content/posts/ to avoid the
 * Astro runtime dependency on `astro:content`.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "../src/lib/yaml";
import { config as dotenv } from "dotenv";
import { runPipeline } from "../src/lib/social/pipeline.js";
import type { Article } from "../src/lib/social/types.js";

dotenv();

const POSTS_DIR = "src/content/posts";

const parseFrontmatter = (source: string): { fm: Record<string, unknown>; body: string } => {
  const m = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(source);
  if (!m) return { fm: {}, body: source };
  return {
    fm: (yaml.load(m[1]!) as Record<string, unknown>) ?? {},
    body: m[2] ?? "",
  };
};

const main = async (): Promise<void> => {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: pnpm social:smoke <slug>");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const ruPath = join(POSTS_DIR, `${slug}.md`);
  const ruPathMdx = join(POSTS_DIR, `${slug}.mdx`);
  const path = existsSync(ruPath) ? ruPath : existsSync(ruPathMdx) ? ruPathMdx : null;
  if (!path) {
    console.error(`post not found: ${slug}`);
    process.exit(1);
  }

  const source = await readFile(path, "utf8");
  const { fm, body } = parseFrontmatter(source);

  const enExists =
    existsSync(join(POSTS_DIR, `en/${slug}.md`)) || existsSync(join(POSTS_DIR, `en/${slug}.mdx`));

  const article: Article = {
    collection: "posts",
    slug,
    title: String(fm.title ?? slug),
    summary: String(fm.summary ?? fm.description ?? ""),
    body,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    pubDate: fm.pubDate instanceof Date ? fm.pubDate : new Date(String(fm.pubDate ?? Date.now())),
    cover: typeof fm.cover === "string" ? { src: fm.cover, alt: String(fm.coverAlt ?? "") } : null,
    lang: (fm.lang === "en" ? "en" : "ru") as "ru" | "en",
    sourceUrl: `https://artka.dev/blog/${slug}`,
    hasEnTwin: enExists,
  };

  const channels = enExists ? (["x_en", "li_en", "tg_ru"] as const) : (["tg_ru"] as const);

  console.warn(`Article: ${article.title}`);
  console.warn(`Channels: ${channels.join(", ")}\n`);

  const out = await runPipeline({ article, channels: [...channels] });
  for (const ch of channels) {
    console.warn(`\n── ${ch} ──`);
    const r = out.drafts[ch];
    if (r?.ok) {
      console.warn(r.value.body);
      if (r.value.threadTail) {
        for (const t of r.value.threadTail) console.warn(`\n  ↳ ${t}`);
      }
    } else {
      console.warn(`FAILED: ${JSON.stringify(r?.error)}`);
    }
    console.warn(`\nNotes:`, JSON.stringify(out.annotations[ch], null, 2));
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
