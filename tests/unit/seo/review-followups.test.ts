import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("independent review follow-ups", () => {
  it("discloses Buttondown's email processing purpose and privacy terms in both languages", () => {
    const ru = source("src/content/site/privacy.md");
    const en = source("src/content/site/en/privacy.md");
    const ruContact = source("src/content/site/contact.md");
    const enContact = source("src/content/site/en/contact.md");

    for (const privacy of [ru, en]) {
      expect(privacy).toContain("Buttondown");
      expect(privacy).toContain("https://www.buttondown.com/legal/privacy");
    }
    expect(ru).toMatch(/email[^.]+(?:подпис|рассыл)/i);
    expect(en).toMatch(/email[^.]+(?:subscription|newsletter)/i);
    expect(ruContact).not.toContain("используется только");
    expect(enContact).not.toContain("used only");
    expect(ru).not.toContain("остаётся только");
    expect(en).not.toContain("remains only");
  });

  it("places the authored course overview after progress and before the lesson list", () => {
    const layout = source("src/layouts/CourseLayout.astro");
    const progress = layout.indexOf('class="course__progress"');
    const overview = layout.indexOf('class="course__overview prose"');
    const lessons = layout.indexOf('class="course__lessons"');

    expect(progress).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(progress);
    expect(lessons).toBeGreaterThan(overview);
  });

  it("keeps the substantive review date synchronized across course landings", () => {
    const ru = source("src/content/courses/claude-code-guide/_index.md");
    const en = source("src/content/courses/claude-code-guide/en/_index.md");

    const reviewDate = ru.match(/^updatedDate: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    expect(reviewDate).toBeDefined();
    expect(en.match(/^updatedDate: (\d{4}-\d{2}-\d{2})$/m)?.[1]).toBe(reviewDate);
  });
});
