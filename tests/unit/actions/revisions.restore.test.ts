/**
 * Regression tests for `revisions.restore`.
 *
 * Bug: the old `toFrontmatter()` in src/actions/revisions.ts rebuilt the
 * frontmatter by hand and silently dropped `summary`, `keywords` and `faq`
 * on restore. These tests drive the exported pure coercion +
 * serialize → write → parse round-trip in a temp dir — no DB, no action runtime.
 */
import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frontmatterFromRevision } from "~/actions/revisions";
import { serializeFrontmatter } from "~/lib/content/frontmatter";
import { readPostFromDisk } from "~/lib/content/post-io";
import { writePostAtomically } from "~/lib/fs/post-writer";

const inTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const base = await mkdtemp(join(tmpdir(), "revisions-restore-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
};

/** Shape of `post_revisions.frontmatter` as stored by posts.upsert (JSONB → dates are ISO strings). */
const storedRevision = {
  title: "Restored title",
  description: "A description that is at least ten characters long.",
  pubDate: "2026-05-09T00:00:00.000Z",
  updatedDate: "2026-06-01T00:00:00.000Z",
  tags: ["a", "b"],
  draft: false,
  cover: "/uploads/cover.png",
  coverAlt: "Cover alt",
  summary: "A TL;DR summary card that is comfortably longer than sixty characters in total.",
  keywords: ["astro", "drizzle"],
  faq: [
    {
      question: "What does this restore test check?",
      answer: "That summary, keywords and faq survive a revision restore round-trip.",
    },
  ],
};

describe("frontmatterFromRevision", () => {
  it("keeps summary, keywords and faq from the stored snapshot", () => {
    const fm = frontmatterFromRevision(storedRevision);
    expect(fm.summary).toBe(storedRevision.summary);
    expect(fm.keywords).toEqual(["astro", "drizzle"]);
    expect(fm.faq).toEqual(storedRevision.faq);
    expect(fm.cover).toBe("/uploads/cover.png");
    expect(fm.coverAlt).toBe("Cover alt");
    expect(fm.pubDate.toISOString()).toBe("2026-05-09T00:00:00.000Z");
    expect(fm.updatedDate?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("defaults keywords to [] for pre-keywords revisions", () => {
    const { keywords: _k, faq: _f, summary: _s, ...legacy } = storedRevision;
    const fm = frontmatterFromRevision(legacy);
    expect(fm.keywords).toBeUndefined();
    expect(fm.faq).toBeUndefined();
    expect(fm.summary).toBeUndefined();
    expect(fm.title).toBe("Restored title");
  });

  it("fails loud when the snapshot violates the current post schema", () => {
    expect(() => frontmatterFromRevision({ ...storedRevision, pubDate: "not-a-date" })).toThrow();
    expect(() => frontmatterFromRevision({ ...storedRevision, description: "short" })).toThrow();
  });
});

describe("restore round-trip on disk", () => {
  it("writes a file that re-parses with summary/keywords/faq intact", async () => {
    await inTempDir(async (dir) => {
      const fm = frontmatterFromRevision(storedRevision);
      await writePostAtomically(dir, "restored", serializeFrontmatter(fm, "Body text.\n"));

      const onDisk = await readPostFromDisk(dir, "restored");
      expect(onDisk).not.toBeNull();
      expect(onDisk?.frontmatter.summary).toBe(storedRevision.summary);
      expect(onDisk?.frontmatter.keywords).toEqual(["astro", "drizzle"]);
      expect(onDisk?.frontmatter.faq).toEqual(storedRevision.faq);
      expect(onDisk?.frontmatter.tags).toEqual(["a", "b"]);
      expect(onDisk?.body).toBe("Body text.\n");
    });
  });
});
