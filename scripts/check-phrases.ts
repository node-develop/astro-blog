/**
 * Runs the editorial phrase gate (banned phrases and, for Russian, speculative voice) over a
 * Markdown post file: `pnpm editorial:phrases src/content/posts/<slug>.md`. Exit code 1 on any hit.
 * The lists live in src/lib/content/banned-phrases.json and are shared with the Content API.
 */
import { readFileSync } from "node:fs";
import * as yaml from "../src/lib/yaml";
import { checkPhrases } from "../src/lib/content-api/editorial";
import type { ArticleDocument } from "../src/lib/content-api/contract";

const path = process.argv[2];
if (!path) {
  process.stderr.write("usage: pnpm editorial:phrases <post.md>\n");
  process.exit(2);
}
const file = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(readFileSync(path, "utf8"));
if (!file) {
  process.stderr.write(`${path}: no frontmatter\n`);
  process.exit(2);
}
const fm = (yaml.load(file[1]!) ?? {}) as Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const faq = Array.isArray(fm.faq) ? (fm.faq as { question?: unknown; answer?: unknown }[]) : [];
const document = {
  lang: fm.lang === "en" ? "en" : "ru",
  title: text(fm.title),
  description: text(fm.description),
  summary: text(fm.summary),
  body: file[2]!,
  faq: faq.map((f) => ({ question: text(f.question), answer: text(f.answer) })),
  ...(fm.seoTitle || fm.seoDescription
    ? {
        seo: {
          title: text(fm.seoTitle) || undefined,
          description: text(fm.seoDescription) || undefined,
        },
      }
    : {}),
} as unknown as ArticleDocument;

const findings = checkPhrases(document);
for (const f of findings) process.stdout.write(`${path}: ${f.code}: ${f.message}\n`);
process.exit(findings.length ? 1 : 0);
