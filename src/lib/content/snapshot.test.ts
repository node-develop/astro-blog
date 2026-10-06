import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ExportArticle } from "../content-api/contract";
import { checkSnapshot } from "./snapshot";

const article = (over: Partial<ExportArticle> = {}): ExportArticle => {
  const content = over.content ?? "---\nlang: ru\n---\n\nBody\n";
  return {
    slug: "a-post",
    lang: "ru",
    revision: "6b1f7a0e-8a58-4c5e-9d5b-0a1d3f7c2b11",
    content,
    contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
    meta: { order: 1, pinned: false, hiddenFromList: false },
    ...over,
  };
};
const snapshot = (...articles: ExportArticle[]) => ({
  snapshotId: "0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e2",
  generatedAt: "2026-10-05T00:00:00.000Z",
  count: articles.length,
  articles,
});

describe("checkSnapshot", () => {
  it("refuses an article whose content was changed after its hash was taken", () => {
    const tampered = article({ contentSha256: "0".repeat(64) });
    expect(() => checkSnapshot(snapshot(tampered), 1, "snap.json")).toThrow(
      /a-post \(ru\).*sha256/,
    );
  });

  it("refuses two articles that would become one collection entry, but not RU and EN of one slug", () => {
    expect(() => checkSnapshot(snapshot(article(), article()), 1, "snap.json")).toThrow(
      /duplicate/,
    );
    const en = article({ lang: "en" });
    expect(checkSnapshot(snapshot(article(), en), 1, "snap.json").count).toBe(2);
  });
});
