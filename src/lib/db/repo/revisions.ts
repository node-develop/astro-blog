import { desc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postRevisions, type PostRevision, type NewPostRevision } from "~/lib/db/schema";

export async function appendRevision(row: NewPostRevision): Promise<PostRevision> {
  const [inserted] = await db.insert(postRevisions).values(row).returning();
  if (!inserted) throw new Error("failed to insert revision");
  return inserted;
}

export async function listRevisionsBySlug(slug: string): Promise<readonly PostRevision[]> {
  return db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.slug, slug))
    .orderBy(desc(postRevisions.createdAt), desc(postRevisions.id));
}

export async function getRevision(id: number): Promise<PostRevision | null> {
  const rows = await db.select().from(postRevisions).where(eq(postRevisions.id, id));
  return rows[0] ?? null;
}
