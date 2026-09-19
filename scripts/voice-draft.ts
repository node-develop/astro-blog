/**
 * Reads RU posts in src/content/posts/, sends to Sonnet asking for a voice
 * profile draft, writes to src/lib/social/voice/profile.draft.md.
 * Operator manually reviews/edits and renames to profile.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config as dotenv } from "dotenv";

dotenv();

const POSTS_DIR = "src/content/posts";
const OUT_PATH = "src/lib/social/voice/profile.draft.md";

const main = async (): Promise<void> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const files = (await readdir(POSTS_DIR)).filter(
    (f) => (f.endsWith(".md") || f.endsWith(".mdx")) && !f.startsWith("e2e-"),
  );
  const sample = files.slice(0, 20);
  const corpus = (await Promise.all(sample.map((f) => readFile(join(POSTS_DIR, f), "utf8")))).join(
    "\n\n---\n\n",
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `You are analysing a writer's corpus of blog posts to compose a "voice profile" for an AI editor.

Read the posts, then write a profile.md following this structure exactly:

# Voice profile — Артём Кашута / artka.dev

## What I do
[2-3 sentences]

## Voice
[5-8 bullets]

## Vocabulary I use
[10+ short replacement pairs]

## Topics I have authority in
[list]

## Topics I should NOT make assertions about
[list]

## Opening lines I use
[5-8 actual or characteristic openings]

## Opening lines that drive me crazy (banned)
[5-8 banned openings, mix RU/EN]

CORPUS:
${corpus.slice(0, 60000)}`,
      },
    ],
  });

  const text = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  await writeFile(OUT_PATH, text);
  console.warn(`Draft written to ${OUT_PATH}. Review, edit, rename to profile.md.`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
