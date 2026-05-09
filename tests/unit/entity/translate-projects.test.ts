import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = readFileSync(join(process.cwd(), "src/lib/translate/site-config.ts"), "utf8");
const script = readFileSync(join(process.cwd(), "scripts/translate.ts"), "utf8");
const orchestrator = readFileSync(
  join(process.cwd(), "src/lib/translate/translate-one.ts"),
  "utf8",
);

describe("translate pipeline supports projects collection", () => {
  it("site-config exposes projectsDir and projectsEnDir", () => {
    expect(cfg).toMatch(/projectsDir:\s*join\(ROOT,\s*["']src\/content\/projects["']\)/);
    expect(cfg).toMatch(/projectsEnDir:\s*join\(ROOT,\s*["']src\/content\/projects\/en["']\)/);
  });
  it("CLI script wires up translateAllProjects", () => {
    expect(script).toMatch(/translateAllProjects/);
  });
  it("CLI main() invokes translateAllProjects", () => {
    const mainBody = script.split("const main")[1] ?? "";
    expect(mainBody).toMatch(/translateAllProjects/);
  });
  it("CLI translateProjectFile translates outcomes[] and links[].label", () => {
    expect(script).toMatch(/outcome_/);
    expect(script).toMatch(/link_label_/);
  });
  it("runtime orchestrator handles the projects schema (arrayFields + linkLabels)", () => {
    // The new translate-one.ts orchestrator (used by /admin Translate button)
    // must cover the same fields as the CLI for projects: outcomes[] and
    // links[].label.
    expect(orchestrator).toMatch(/projects:\s*\{[\s\S]*?arrayFields:\s*\[\s*["']outcomes["']\s*\]/);
    expect(orchestrator).toMatch(/projects:\s*\{[\s\S]*?linkLabels:\s*true/);
  });
});
