import { describe, expect, it } from "vitest";
import { assertSeoBuildOutput } from "./verify-seo-build";

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
});
