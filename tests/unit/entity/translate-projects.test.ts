import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = readFileSync(join(process.cwd(), "scripts/lib/site-config.ts"), "utf8");
const script = readFileSync(join(process.cwd(), "scripts/translate.ts"), "utf8");

describe("translate pipeline supports projects collection", () => {
  it("site-config exposes projectsDir and projectsEnDir", () => {
    expect(cfg).toMatch(/projectsDir:\s*join\(ROOT,\s*["']src\/content\/projects["']\)/);
    expect(cfg).toMatch(/projectsEnDir:\s*join\(ROOT,\s*["']src\/content\/projects\/en["']\)/);
  });
  it("translate.ts wires up translateAllProjects", () => {
    expect(script).toMatch(/translateAllProjects/);
  });
  it("main() invokes translateAllProjects", () => {
    const mainBody = script.split("const main")[1] ?? "";
    expect(mainBody).toMatch(/translateAllProjects/);
  });
  it("translateProjectFile translates outcomes[] and links[].label", () => {
    expect(script).toMatch(/outcome_/);
    expect(script).toMatch(/link_label_/);
  });
});
