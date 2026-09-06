import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "~/lib/yaml";

const projectsDir = join(process.cwd(), "src/content/projects");

const getRuFiles = () =>
  existsSync(projectsDir)
    ? readdirSync(projectsDir).filter((f) => /\.md$/.test(f) && !f.startsWith("."))
    : [];

const parseFm = (file: string): Record<string, unknown> => {
  const src = readFileSync(join(projectsDir, file), "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  return m && m[1] ? (yaml.load(m[1]) as Record<string, unknown>) : {};
};

describe("projects collection", () => {
  it("contains ≥ 2 RU entries", () => {
    expect(getRuFiles().length).toBeGreaterThanOrEqual(2);
  });
  it("every entry has stack and outcomes populated", () => {
    for (const file of getRuFiles()) {
      const fm = parseFm(file);
      expect(Array.isArray(fm["stack"]) && (fm["stack"] as unknown[]).length).toBeGreaterThan(0);
      expect(Array.isArray(fm["outcomes"]) && (fm["outcomes"] as unknown[]).length).toBeGreaterThan(
        0,
      );
    }
  });
  it("at least one entry is featured", () => {
    const files = getRuFiles();
    expect(files.some((f) => parseFm(f)["featured"] === true)).toBe(true);
  });
});
