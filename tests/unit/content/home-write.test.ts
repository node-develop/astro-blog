import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "~/lib/yaml";
import { writeHomeToDisk } from "~/lib/content/write-home";
import { homeFrontmatterSchema, KEY_ORDER } from "~/lib/content/home-schema";

let workDir: string;
let homePath: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "home-write-"));
  homePath = join(workDir, "home.md");
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const parseFrontmatter = async (path: string): Promise<Record<string, unknown>> => {
  const raw = await readFile(path, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m || !m[1]) throw new Error("no frontmatter");
  return yaml.load(m[1]) as Record<string, unknown>;
};

describe("writeHomeToDisk — T-1 round-trip", () => {
  it("preserves all fields through write → read → write", async () => {
    const initial = {
      title: "Главная",
      heroTitle: "Заголовок",
      heroLede: "Подзаголовок",
      heroEyebrow: "Eyebrow",
      heroCta: "CTA",
      courseTitle: "Курс",
      metaTitle: "Meta",
      metaDescription: "Meta description",
      manuallyEdited: false,
    };

    await writeHomeToDisk(homePath, initial);
    const after = await parseFrontmatter(homePath);

    for (const [k, v] of Object.entries(initial)) {
      expect(after[k]).toBe(v);
    }
  });

  it("emits keys in KEY_ORDER for stable diffs", async () => {
    await writeHomeToDisk(homePath, {
      manuallyEdited: false,
      title: "T",
      metaTitle: "MT",
      heroTitle: "HT",
      authorLabel: "AL",
    });
    const raw = await readFile(homePath, "utf8");
    const fmBlock = raw.split("---")[1] ?? "";
    const lines = fmBlock
      .split("\n")
      .map((l) => l.split(":")[0]?.trim())
      .filter((k): k is string => Boolean(k));
    const seen = lines.filter((k) => KEY_ORDER.includes(k as (typeof KEY_ORDER)[number]));

    // Ensure encountered keys appear in canonical order.
    const indices = seen.map((k) => KEY_ORDER.indexOf(k as (typeof KEY_ORDER)[number]));
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });
});

describe("writeHomeToDisk — T-2b merge-semantics", () => {
  it("preserves untouched fields when patch contains a single field", async () => {
    // Seed with a full-bodied home.md.
    await writeHomeToDisk(homePath, {
      title: "Главная",
      heroTitle: "Original hero",
      heroLede: "Original lede",
      courseTitle: "Original course",
      authorLabel: "Original author",
      metaTitle: "Original meta",
      metaDescription: "Original description, ten plus characters",
      manuallyEdited: false,
    });

    // Patch with ONLY heroTitle.
    await writeHomeToDisk(homePath, { title: "Главная", heroTitle: "Updated hero" });

    const after = await parseFrontmatter(homePath);
    expect(after["heroTitle"]).toBe("Updated hero");
    // All other fields must survive untouched.
    expect(after["heroLede"]).toBe("Original lede");
    expect(after["courseTitle"]).toBe("Original course");
    expect(after["authorLabel"]).toBe("Original author");
    expect(after["metaTitle"]).toBe("Original meta");
    expect(after["metaDescription"]).toBe("Original description, ten plus characters");
  });

  it("undefined patch values do not delete existing fields", async () => {
    await writeHomeToDisk(homePath, {
      title: "Главная",
      heroEyebrow: "Will survive",
      heroTitle: "Required",
      manuallyEdited: false,
    });
    await writeHomeToDisk(homePath, {
      title: "Главная",
      heroEyebrow: undefined,
      heroTitle: "Updated",
    });
    const after = await parseFrontmatter(homePath);
    expect(after["heroEyebrow"]).toBe("Will survive");
    expect(after["heroTitle"]).toBe("Updated");
  });
});

describe("writeHomeToDisk — T-3 EN manuallyEdited semantics", () => {
  it("respects manuallyEdited:true in patch (server enforces for EN saves)", async () => {
    await writeHomeToDisk(homePath, {
      title: "Home",
      heroTitle: "Hello",
      metaTitle: "M",
      metaDescription: "Description with sufficient length",
      manuallyEdited: true,
    });
    const after = await parseFrontmatter(homePath);
    expect(after["manuallyEdited"]).toBe(true);
  });
});

describe("homeFrontmatterSchema — T-7 parse live files", () => {
  it("parses src/content/site/home.md", async () => {
    const raw = await readFile("src/content/site/home.md", "utf8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    expect(m?.[1]).toBeTruthy();
    const data = yaml.load(m![1]!);
    const result = homeFrontmatterSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("parses src/content/site/en/home.md", async () => {
    const raw = await readFile("src/content/site/en/home.md", "utf8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    expect(m?.[1]).toBeTruthy();
    const data = yaml.load(m![1]!);
    const result = homeFrontmatterSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
