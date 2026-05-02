import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = readFileSync(join(process.cwd(), "src/content.config.ts"), "utf8");

describe("projects content collection", () => {
  it("declares projects alongside posts and site", () => {
    expect(cfg).toMatch(/const\s+projects\s*=\s*defineCollection/);
    expect(cfg).toMatch(/collections\s*=\s*\{[^}]*projects[^}]*\}/);
  });
  it("loads from src/content/projects via glob", () => {
    expect(cfg).toMatch(/base:\s*["']\.\/src\/content\/projects["']/);
    expect(cfg).toMatch(/pattern:\s*["']\*\*\/\*\.md["']/);
  });
  it("schema requires title, description, role, status, pubDate, stack", () => {
    expect(cfg).toMatch(/title:\s*z\.string\(\)/);
    expect(cfg).toMatch(/description:\s*z\.string\(\)/);
    expect(cfg).toMatch(/role:\s*z\.string\(\)/);
    expect(cfg).toMatch(/status:\s*z\.enum\(\[/);
    expect(cfg).toMatch(/pubDate:\s*z\.coerce\.date\(\)/);
    expect(cfg).toMatch(/stack:\s*z\.array\(z\.string\(\)\)/);
  });
  it("schema declares optional links and outcomes arrays", () => {
    expect(cfg).toMatch(/links:\s*z\.array/);
    expect(cfg).toMatch(/outcomes:\s*z\.array/);
  });
  it("preserves existing posts and site collections", () => {
    expect(cfg).toMatch(/const\s+posts\s*=\s*defineCollection/);
    expect(cfg).toMatch(/const\s+site\s*=\s*defineCollection/);
  });
});
