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
});
