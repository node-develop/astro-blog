/**
 * Regression tests for `site.update`.
 *
 * Bug: the action wrote `dump({ title })` as the WHOLE frontmatter, so a
 * save from /admin/site/<slug> dropped `description`, `sourceHash`,
 * `manuallyEdited` (and anything else) from the file. The action now goes
 * through `writeSiteToDisk` (read-merge-write); these tests exercise that
 * path in a temp dir — no DB, no action runtime.
 */
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load as loadYaml } from "~/lib/yaml";
import { mergeSiteFile, readSiteFromDisk, writeSiteToDisk } from "~/lib/content/site-io";

const inTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const base = await mkdtemp(join(tmpdir(), "site-update-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
};

const ABOUT_MD = [
  "---",
  "title: Обо мне",
  "description: Кто я и чем занимаюсь — краткая справка.",
  "sourceHash: abc123",
  "manuallyEdited: true",
  "---",
  "",
  "## Старый текст",
  "",
].join("\n");

const frontmatterOf = async (path: string): Promise<Record<string, unknown>> => {
  const raw = await readFile(path, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return (loadYaml(m?.[1] ?? "") ?? {}) as Record<string, unknown>;
};

describe("mergeSiteFile", () => {
  it("overrides title and carries every other existing field through", () => {
    const out = mergeSiteFile(
      { title: "Old", description: "Desc", sourceHash: "h", manuallyEdited: true },
      { title: "New" },
      "Body",
    );
    const fm = loadYaml(/^---\n([\s\S]*?)\n---/.exec(out)?.[1] ?? "") as Record<string, unknown>;
    expect(fm).toEqual({
      title: "New",
      description: "Desc",
      sourceHash: "h",
      manuallyEdited: true,
    });
    expect(out.endsWith("---\n\nBody")).toBe(true);
  });
});

describe("writeSiteToDisk", () => {
  it("preserves description / sourceHash / manuallyEdited when only title+body change", async () => {
    await inTempDir(async (dir) => {
      await writeFile(join(dir, "about.md"), ABOUT_MD, "utf8");

      await writeSiteToDisk(dir, "about", { title: "Новый заголовок", body: "## Новый текст\n" });

      const fm = await frontmatterOf(join(dir, "about.md"));
      expect(fm["title"]).toBe("Новый заголовок");
      expect(fm["description"]).toBe("Кто я и чем занимаюсь — краткая справка.");
      expect(fm["sourceHash"]).toBe("abc123");
      expect(fm["manuallyEdited"]).toBe(true);

      const page = await readSiteFromDisk(dir, "about");
      expect(page?.title).toBe("Новый заголовок");
      expect(page?.body).toBe("## Новый текст\n");
    });
  });

  it("creates a new page with just the title when no file exists yet", async () => {
    await inTempDir(async (dir) => {
      await writeSiteToDisk(dir, "uses", { title: "Uses", body: "Tools.\n" });
      const fm = await frontmatterOf(join(dir, "uses.md"));
      expect(fm).toEqual({ title: "Uses" });
    });
  });
});
