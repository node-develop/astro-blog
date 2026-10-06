import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The html-validate gate of `pnpm verify:html`, driven through the project config on synthetic
 * HTML. `--config` is required: from a tmp dir the project config is not discovered.
 */

const run = promisify(execFile);
const BIN = resolve(process.cwd(), "node_modules/.bin/html-validate");
const CONFIG = resolve(process.cwd(), ".htmlvalidate.json");

type Message = Readonly<{ ruleId: string }>;
type Report = Readonly<{ exitCode: number; ruleIds: readonly string[] }>;

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const page = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

const validate = async (body: string): Promise<Report> => {
  const dir = await mkdtemp(join(tmpdir(), "html-validate-"));
  dirs.push(dir);
  const file = join(dir, "index.html");
  await writeFile(file, page(body));
  try {
    await run(BIN, ["--config", CONFIG, "--formatter", "json", file]);
    return { exitCode: 0, ruleIds: [] };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    const results = JSON.parse(failure.stdout ?? "[]") as ReadonlyArray<{
      messages: readonly Message[];
    }>;
    return {
      exitCode: failure.code ?? 1,
      ruleIds: results.flatMap((result) => result.messages.map((message) => message.ruleId)),
    };
  }
};

describe("html-validate gate", () => {
  it("accepts a valid document", async () => {
    expect(await validate(`<h1>T</h1><h2>S</h2><img src="/a.png" alt="a">`)).toEqual({
      exitCode: 0,
      ruleIds: [],
    });
  });

  it("rejects an img without an alt attribute (wcag/h37)", async () => {
    const report = await validate(`<h1>T</h1><img src="/a.png">`);
    expect(report.exitCode).not.toBe(0);
    expect(report.ruleIds).toContain("wcag/h37");
  });

  it("rejects a duplicate id (no-dup-id)", async () => {
    expect((await validate(`<h1>T</h1><p id="x"></p><p id="x"></p>`)).ruleIds).toContain(
      "no-dup-id",
    );
  });

  it("rejects a skipped heading level and a heading deeper than h1 first (heading-level)", async () => {
    expect((await validate(`<h1>T</h1><h3>S</h3>`)).ruleIds).toContain("heading-level");
    expect((await validate(`<h3>S</h3><h1>T</h1>`)).ruleIds).toContain("heading-level");
  });

  it("rejects a second h1 (heading-level)", async () => {
    expect((await validate(`<h1>T</h1><h1>U</h1>`)).ruleIds).toContain("heading-level");
  });

  it("rejects a reference to an id that does not exist (no-missing-references)", async () => {
    const report = await validate(`<h1>T</h1><button aria-controls="drawer">m</button>`);
    expect(report.ruleIds).toContain("no-missing-references");
  });
});
