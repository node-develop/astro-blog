import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ru = readFileSync(join(process.cwd(), "src/content/site/about.md"), "utf8");

describe("src/content/site/about.md — expert profile", () => {
  const required = ["## Кто я", "## Чем занимаюсь", "## Стек", "## Что написал", "## Контакты"];
  it.each(required)("contains %s heading", (h) => expect(ru).toContain(h));

  it("declares years of experience numerically (≥ 1)", () => {
    const m = ru.match(/(\d+)\+?\s*(год|лет|года)/i);
    expect(m).not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBeGreaterThanOrEqual(1);
  });

  it("lists at least 3 notable works as bullets under '## Что написал'", () => {
    const section = ru.split("## Что написал")[1]?.split(/^##\s/m)[0] ?? "";
    const bullets = section.split("\n").filter((l) => /^\s*-\s+/.test(l));
    expect(bullets.length).toBeGreaterThanOrEqual(3);
  });

  it("contains a mailto: contact link", () => {
    expect(ru).toMatch(/\[.*\]\(mailto:[^)]+\)/);
  });

  it("body has no h1 (#) — title comes from frontmatter", () => {
    const body = ru.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });

  it("frontmatter has title", () => {
    expect(ru).toMatch(/^---[\s\S]*?title:[\s\S]*?---/);
  });
});
