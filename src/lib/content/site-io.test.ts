import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSiteFromDisk, listSiteFiles } from "./site-io";

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
