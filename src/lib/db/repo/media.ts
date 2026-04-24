import { desc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { mediaAssets, type MediaAsset, type NewMediaAsset } from "~/lib/db/schema";

export async function recordMediaAsset(row: NewMediaAsset): Promise<MediaAsset> {
  const [inserted] = await db.insert(mediaAssets).values(row).returning();
  if (!inserted) throw new Error("failed to insert media asset");
  return inserted;
}

export async function listMedia(): Promise<readonly MediaAsset[]> {
  return db.select().from(mediaAssets).orderBy(desc(mediaAssets.uploadedAt));
}

export async function deleteMediaAsset(id: number): Promise<MediaAsset | null> {
  const [deleted] = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
  return deleted ?? null;
}
