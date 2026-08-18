import { describe, expect, it } from "vitest";
import { assertSeoBuildOutput, diagnoseSeoBuildOutput } from "./verify-seo-build";

describe("assertSeoBuildOutput", () => {
  it("accepts clean build output", () => {
    expect(assertSeoBuildOutput("build complete\n")).toEqual([]);
  });

  it("detects a duplicate redirect route warning", () => {
    expect(assertSeoBuildOutput("static route cannot be defined more than once")).toContain(
      "duplicate redirect route",
    );
  });

  it("detects the invalid view-transition selector warning", () => {
    expect(
      assertSeoBuildOutput('::view-transition-group([transition-name^="post-title"])'),
    ).toContain("invalid view-transition selector");
  });

  it("detects the SEO chunk-cycle warning", () => {
    expect(assertSeoBuildOutput("buildLandingNodes is reexported through module")).toContain(
      "SEO chunk cycle",
    );
  });

  it("reports each warning family at most once", () => {
    expect(
      assertSeoBuildOutput(
        "static route cannot be defined more than once\nstatic route cannot be defined more than once",
      ),
    ).toEqual(["duplicate redirect route"]);
  });

  it("prints context for an SEO chunk-cycle warning that spans lines", () => {
    const output = [
      "rendering server chunks",
      "buildLandingNodes is imported from landing.ts",
      "and reexported through module schema.ts while both modules depend on each other",
      "build complete",
    ].join("\n");

    expect(diagnoseSeoBuildOutput(output)).toEqual([
      {
        label: "SEO chunk cycle",
        block: expect.stringContaining("reexported through module schema.ts"),
      },
    ]);
    expect(diagnoseSeoBuildOutput(output)[0]?.block).not.toContain("unavailable");
  });
});
