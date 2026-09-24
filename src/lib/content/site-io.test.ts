import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load as loadYaml } from "~/lib/yaml";
import { listSiteFiles, mergeSiteFile, readSiteFromDisk, writeSiteToDisk } from "./site-io";

const inTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const base = await mkdtemp(join(tmpdir(), "site-io-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
};

const ABOUT_MD = `---\ntitle: "Обо мне"\n---\n\n# Обо мне\n\nТекст страницы.\n`;

describe("readSiteFromDisk", () => {
  it("parses title and body from a valid site md file", async () => {
    await inTempDir(async (dir) => {
      await writeFile(join(dir, "about.md"), ABOUT_MD, "utf8");
      const result = await readSiteFromDisk(dir, "about");
      expect(result).not.toBeNull();
      expect(result?.slug).toBe("about");
      expect(result?.title).toBe("Обо мне");
      expect(result?.body).toContain("# Обо мне");
      expect(result?.mtime).toBeInstanceOf(Date);
    });
  });

  it("returns null when file does not exist", async () => {
    await inTempDir(async (dir) => {
      const result = await readSiteFromDisk(dir, "nonexistent");
      expect(result).toBeNull();
    });
  });

  it("falls back to slug as title when title is missing", async () => {
    await inTempDir(async (dir) => {
      await writeFile(join(dir, "bare.md"), `---\n---\n\nBody text.\n`, "utf8");
      const result = await readSiteFromDisk(dir, "bare");
      expect(result?.title).toBe("bare");
    });
  });
});

describe("listSiteFiles", () => {
  it("lists md files excluding subdirectories", async () => {
    await inTempDir(async (dir) => {
      await writeFile(join(dir, "about.md"), ABOUT_MD, "utf8");
      await writeFile(join(dir, "contact.md"), `---\ntitle: Контакты\n---\n\nКонтакты.\n`, "utf8");
      // Создаём папку en/ с файлом — не должна попасть в список
      await mkdir(join(dir, "en"), { recursive: true });
      await writeFile(join(dir, "en", "about.md"), ABOUT_MD, "utf8");

      const files = await listSiteFiles(dir);
      const slugs = files.map((f) => f.slug).sort();
      expect(slugs).toEqual(["about", "contact"]);
    });
  });

  it("returns empty array when directory is empty", async () => {
    await inTempDir(async (dir) => {
      const files = await listSiteFiles(dir);
      expect(files).toHaveLength(0);
    });
  });
});

// Regression (site.update): the action once wrote `dump({ title })` as the whole
// frontmatter, dropping description / sourceHash / manuallyEdited on every save.
const ABOUT_WITH_META_MD = [
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
      await writeFile(join(dir, "about.md"), ABOUT_WITH_META_MD, "utf8");

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
