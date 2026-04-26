#!/usr/bin/env tsx
import "dotenv/config";
import { resolve } from "node:path";
import { listPostFiles, readPostFromDisk } from "../src/lib/content/post-io.js";
import { setSearchVector } from "../src/lib/db/repo/posts-meta.js";

const POSTS_DIR = resolve(process.cwd(), "src/content/posts");

async function main(): Promise<void> {
  const slugs = await listPostFiles(POSTS_DIR);
  let updated = 0;
  for (const slug of slugs) {
    const post = await readPostFromDisk(POSTS_DIR, slug);
    if (!post) {
      console.warn(`skip ${slug}: read failed`);
      continue;
    }
    await setSearchVector(slug, {
      title: post.frontmatter.title,
      tags: post.frontmatter.tags ?? [],
      body: post.body,
    });
    updated += 1;
  }
  console.warn(`backfilled search_vector for ${updated} posts`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
