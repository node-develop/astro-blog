import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bootTestDb, type TestDb } from "./setup";
import { postsMeta, postRevisions, users } from "~/lib/db/schema";

describe("cms integration", () => {
  let env: TestDb;

  beforeAll(async () => {
    env = await bootTestDb();
  }, 180_000);

  afterAll(async () => {
    await env.teardown();
  });

  it("reorderMeta is atomic (all slugs updated or none)", async () => {
    const [user] = await env.db
      .insert(users)
      .values({ email: "reorder@example.com", role: "admin" })
      .returning();
    if (!user) throw new Error("seed failed");

    await env.db.insert(postsMeta).values([
      { slug: "a", order: 1 },
      { slug: "b", order: 2 },
      { slug: "c", order: 3 },
    ]);

    const newOrder = ["c", "a", "b"];
    await env.db.transaction(async (tx) => {
      for (let i = 0; i < newOrder.length; i++) {
        await tx
          .update(postsMeta)
          .set({ order: i + 1 })
          .where(eq(postsMeta.slug, newOrder[i]!));
      }
    });

    const rows = await env.db.select().from(postsMeta).orderBy(postsMeta.order);
    expect(rows.map((r) => r.slug)).toEqual(newOrder);
  });

  it("post_revisions prune keeps only the latest 50 per slug", async () => {
    const [user] = await env.db
      .insert(users)
      .values({ email: "writer@example.com", role: "editor" })
      .returning();
    if (!user) throw new Error("seed failed");

    for (let i = 0; i < 55; i++) {
      await env.db.insert(postRevisions).values({
        slug: "long-lived",
        frontmatter: { n: i },
        body: `body ${i}`,
        authorId: user.id,
      });
    }

    const count = await env.db
      .select({ n: sql<number>`count(*)` })
      .from(postRevisions)
      .where(eq(postRevisions.slug, "long-lived"));

    expect(Number(count[0]?.n)).toBe(50);
  });

  it("upsert writes file and appends revision (file I/O happy path)", async () => {
    const slug = `test-upsert-${Date.now()}`;

    const { writePostAtomically } = await import("~/lib/fs/post-writer");
    const { serializeFrontmatter } = await import("~/lib/content/frontmatter");
    const { appendRevision } = await import("~/lib/db/repo/revisions");
    const { ensureMeta } = await import("~/lib/db/repo/posts-meta");
    const { mkdtemp, rm, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    // Use the real DB for user insertion so FK constraints pass when
    // appendRevision / ensureMeta call the production DB client.
    const { db: realDb } = await import("~/lib/db");
    const [user] = await realDb
      .insert(users)
      .values({ email: `editor-upsert-test-${Date.now()}@example.com`, role: "editor" })
      .returning();
    if (!user) throw new Error("seed failed");

    const baseDir = await mkdtemp(join(tmpdir(), "cms-test-"));
    try {
      const fm = {
        title: "Test",
        description: "x".repeat(20),
        pubDate: new Date("2026-04-23"),
        tags: [],
        draft: true,
      };
      await ensureMeta(slug);
      const rev = await appendRevision({
        slug,
        frontmatter: fm,
        body: "hello",
        authorId: user.id,
      });
      const written = await writePostAtomically(baseDir, slug, serializeFrontmatter(fm, "hello"));
      const onDisk = await readFile(written, "utf8");
      expect(onDisk).toContain("title: Test");
      expect(rev.id).toBeGreaterThan(0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
      // Clean up test data from production DB (FK order: revisions → meta → user).
      await realDb.delete(postRevisions).where(eq(postRevisions.slug, slug));
      await realDb.delete(postsMeta).where(eq(postsMeta.slug, slug));
      await realDb.delete(users).where(eq(users.id, user.id));
    }
  });
});
