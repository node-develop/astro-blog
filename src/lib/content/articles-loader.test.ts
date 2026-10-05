import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoaderContext } from "astro/loaders";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportArticle, ExportSnapshot } from "../content-api/contract";
import { articlesLoader, syncSnapshot, toEntrySource } from "./articles-loader";

vi.mock("~/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const REVISION = "6b1f7a0e-8a58-4c5e-9d5b-0a1d3f7c2b11";
const HEADER_BODY = "\n\nFirst paragraph.\n\n## Part\n\nSecond.\n";

const article = (over: Partial<ExportArticle> & { header?: string } = {}): ExportArticle => {
  const { header, ...rest } = over;
  const lang = rest.lang ?? "ru";
  const revision = rest.revision ?? REVISION;
  const content =
    rest.content ??
    `---\ntitle: A title\nlang: ${lang}\napiRevision: ${revision}\n${header ?? ""}---${HEADER_BODY}`;
  return {
    slug: "a-post",
    lang,
    revision,
    content,
    contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
    meta: { order: 1, pinned: false, hiddenFromList: false },
    ...rest,
  };
};

const snapshotOf = (...articles: ExportArticle[]): ExportSnapshot => ({
  snapshotId: "0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e2",
  generatedAt: "2026-10-05T00:00:00.000Z",
  count: articles.length,
  articles,
});

type Entry = {
  id: string;
  data: Record<string, unknown>;
  body?: string;
  rendered?: unknown;
  digest?: string;
};
const fakeContext = (
  renderMarkdown = vi.fn(async (doc: string) => ({ html: `<p>${doc.length}</p>`, metadata: {} })),
) => {
  const entries = new Map<string, Entry>();
  const ctx = {
    store: {
      get: (id: string) => entries.get(id),
      set: (entry: Entry) => {
        // Astro's MutableDataStore stores nothing when the digest is unchanged.
        const existing = entries.get(entry.id);
        if (existing?.digest !== undefined && existing.digest === entry.digest) return false;
        entries.set(entry.id, entry);
        return true;
      },
      delete: (id: string) => void entries.delete(id),
      keys: () => [...entries.keys()],
    },
    parseData: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    renderMarkdown,
    generateDigest: (data: unknown) => JSON.stringify(data),
  };
  return {
    ctx: ctx as unknown as Pick<
      LoaderContext,
      "store" | "parseData" | "renderMarkdown" | "generateDigest"
    >,
    entries,
    renderMarkdown,
  };
};

describe("toEntrySource", () => {
  it("gives the entry the body without the YAML header, and the whole document to the renderer", () => {
    const ru = toEntrySource(article());
    const en = toEntrySource(article({ lang: "en", revision: REVISION }));
    expect([ru.id, en.id]).toEqual(["a-post", "en/a-post"]);
    expect(ru.body).toBe("First paragraph.\n\n## Part\n\nSecond.");
    expect(ru.body.startsWith("---")).toBe(false);
    expect(ru.document.startsWith("---\n")).toBe(true);
    expect(ru.data).toMatchObject({ title: "A title", lang: "ru" });
  });

  it("carries the snapshot meta into data._meta", () => {
    const meta = { order: 7, pinned: true, hiddenFromList: true };
    expect(toEntrySource(article({ meta })).data._meta).toEqual(meta);
  });

  it.each([
    ["lang", { content: `---\ntitle: T\nlang: en\napiRevision: ${REVISION}\n---\n\nx\n` }],
    [
      "apiRevision",
      {
        content:
          "---\ntitle: T\nlang: ru\napiRevision: 0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e2\n---\n\nx\n",
      },
    ],
  ] as const)(
    "refuses an article whose header disagrees with the snapshot on %s",
    (_name, over) => {
      expect(() => toEntrySource(article(over))).toThrow(/a-post/);
    },
  );
});

describe("syncSnapshot", () => {
  it("renders the whole document, header included, and stores what it got", async () => {
    const { ctx, entries, renderMarkdown } = fakeContext();
    const report = await syncSnapshot(ctx, snapshotOf(article()));
    expect(report).toEqual({ rendered: 1, skipped: 0, deleted: 0 });
    expect(renderMarkdown.mock.calls[0]![0]).toMatch(/^---\n/);
    expect(entries.get("a-post")?.rendered).toBeDefined();
  });

  it("does not render again when nothing changed", async () => {
    const { ctx, renderMarkdown } = fakeContext();
    await syncSnapshot(ctx, snapshotOf(article()));
    const report = await syncSnapshot(ctx, snapshotOf(article()));
    expect(report).toEqual({ rendered: 0, skipped: 1, deleted: 0 });
    expect(renderMarkdown).toHaveBeenCalledTimes(1);
  });

  it("renders an entry whose digest matches but which has no stored render", async () => {
    const { ctx, entries, renderMarkdown } = fakeContext();
    await syncSnapshot(ctx, snapshotOf(article()));
    const { rendered: _dropped, ...unrendered } = entries.get("a-post")!;
    entries.set("a-post", unrendered);
    await syncSnapshot(ctx, snapshotOf(article()));
    expect(renderMarkdown).toHaveBeenCalledTimes(2);
    expect(entries.get("a-post")?.rendered).toBeDefined();
  });

  it("renders again and stores the new body when only the content changed", async () => {
    const { ctx, entries, renderMarkdown } = fakeContext();
    await syncSnapshot(ctx, snapshotOf(article()));
    const content = `---\ntitle: A title\nlang: ru\napiRevision: ${REVISION}\n---\n\nRewritten.\n`;
    await syncSnapshot(ctx, snapshotOf(article({ content })));
    expect(renderMarkdown).toHaveBeenCalledTimes(2);
    expect(entries.get("a-post")?.body).toBe("Rewritten.");
  });

  it("renders again and updates _meta when only the meta changed", async () => {
    const { ctx, entries, renderMarkdown } = fakeContext();
    await syncSnapshot(ctx, snapshotOf(article()));
    const meta = { order: 1, pinned: false, hiddenFromList: true };
    await syncSnapshot(ctx, snapshotOf(article({ meta })));
    expect(renderMarkdown).toHaveBeenCalledTimes(2);
    expect(entries.get("a-post")?.data._meta).toEqual(meta);
  });

  it("deletes an entry that the snapshot no longer has", async () => {
    const { ctx, entries } = fakeContext();
    await syncSnapshot(ctx, snapshotOf(article(), article({ slug: "gone" })));
    const report = await syncSnapshot(ctx, snapshotOf(article()));
    expect(report.deleted).toBe(1);
    expect([...entries.keys()]).toEqual(["a-post"]);
  });

  it("lets a render error through instead of storing a half-built entry", async () => {
    const { ctx, entries } = fakeContext(vi.fn().mockRejectedValue(new Error("mermaid failed")));
    await expect(syncSnapshot(ctx, snapshotOf(article()))).rejects.toThrow("mermaid failed");
    expect(entries.size).toBe(0);
  });
});

describe("articlesLoader guards", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const load = async (articles: ExportArticle[], minArticles: number): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "articles-loader-"));
    dirs.push(root);
    await writeFile(join(root, "content-manifest.json"), JSON.stringify({ minArticles }));
    await writeFile(join(root, "snapshot.json"), JSON.stringify(snapshotOf(...articles)));
    vi.stubEnv("CONTENT_SNAPSHOT", join(root, "snapshot.json"));
    const { ctx } = fakeContext();
    await articlesLoader().load({
      ...ctx,
      config: { root: pathToFileURL(`${root}/`) },
    } as unknown as LoaderContext);
  };

  it("refuses an empty snapshot", async () => {
    await expect(load([], 1)).rejects.toThrow(/empty/);
  });

  it("refuses a snapshot below the floor, naming both numbers", async () => {
    await expect(load([article()], 2)).rejects.toThrow(/1 articles.*floor of 2/);
  });

  it("refuses an empty CONTENT_SNAPSHOT instead of reading the root", async () => {
    vi.stubEnv("CONTENT_SNAPSHOT", "");
    const { ctx } = fakeContext();
    await expect(
      articlesLoader().load({
        ...ctx,
        config: { root: pathToFileURL(`${tmpdir()}/`) },
      } as unknown as LoaderContext),
    ).rejects.toThrow(/CONTENT_SNAPSHOT/);
  });

  it("accepts a snapshot exactly at the floor", async () => {
    await expect(load([article(), article({ slug: "b-post" })], 2)).resolves.toBeUndefined();
  });
});
