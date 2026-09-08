import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { load } from "~/lib/yaml";

const root = join(process.cwd(), "src/content/courses/claude-code-guide");
const read = (locale: string, name: string): string =>
  readFileSync(join(root, locale, name), "utf8");
const frontmatter = (source: string): Record<string, unknown> =>
  load(source.match(/^---\n([\s\S]*?)\n---/)![1]!) as Record<string, unknown>;
const date = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
const code = (source: string, language: string): string => {
  const block = source.match(new RegExp("```" + language + "\\n([\\s\\S]*?)\\n```"));
  if (!block?.[1]) throw new Error(`Missing ${language} example`);
  return block[1];
};

describe("reviewed course examples", () => {
  it("keeps all 14 lesson pairs ordered and synchronized with the landing review date", () => {
    const files = readdirSync(root)
      .filter((name) => /^\d\d-.*\.md$/.test(name))
      .sort();
    expect(files).toHaveLength(14);
    const reviewDate = date(frontmatter(read("", "_index.md")).updatedDate);
    for (const locale of ["", "en"]) {
      expect(date(frontmatter(read(locale, "_index.md")).updatedDate)).toBe(reviewDate);
      files.forEach((file, index) => {
        const fm = frontmatter(read(locale, file));
        expect(fm.order, file).toBe(index + 1);
        expect(fm.locale).toBe(locale || "ru");
        expect(date(fm.updatedDate), file).toBe(reviewDate);
        expect(date(fm.pubDate)).toBe("2026-04-23");
      });
    }
  });

  it.each(["", "en"])(
    "executes the documented hook from a different directory with spaces (%s)",
    (locale) => {
      const source = read(locale, "05-hooks.md");
      const config = JSON.parse(code(source, "json"));
      const hook = config.hooks.PostToolUse[0].hooks[0];
      const project = mkdtempSync(join(tmpdir(), "course hook "));
      try {
        // Keep the documented project-relative path exactly as published.
        const result = spawnSync(process.execPath, [
          "--input-type=module",
          "-e",
          "import fs from 'node:fs'; fs.mkdirSync(process.argv[1],{recursive:true})",
          join(project, ".claude/hooks"),
        ]);
        expect(result.status).toBe(0);
        writeFileSync(join(project, ".claude/hooks/observe-edit.mjs"), code(source, "javascript"));
        const run = (input: string) =>
          spawnSync("/bin/sh", ["-c", hook.command], {
            cwd: tmpdir(),
            env: { ...process.env, CLAUDE_PROJECT_DIR: project },
            input,
            encoding: "utf8",
            timeout: hook.timeout * 1000,
          });
        const success = run('{"tool_name":"Edit"}');
        expect(success.status).toBe(0);
        expect(success.stderr.trim()).toBe("Observed tool: Edit");
        expect(run("invalid json").status).not.toBe(0);
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    },
  );

  it.each(["", "en"])("publishes parseable plugin and skill metadata (%s)", (locale) => {
    const plugin = JSON.parse(code(read(locale, "07-plugins.md"), "json"));
    const skill = frontmatter(code(read(locale, "04-skills.md"), "markdown"));
    expect(plugin.name).toBe("trip-toolkit");
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(skill.name).toBe("review-contract");
    expect(skill["disable-model-invocation"]).toBe(true);
    expect(read(locale, "07-plugins.md")).toContain(`/${plugin.name}:${skill.name}`);
  });
});
