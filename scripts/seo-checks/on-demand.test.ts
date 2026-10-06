import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { staleExemptions } from "./on-demand";
import { disposeDists, distFrom, validFiles, type Files } from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

describe("staleExemptions", () => {
  it("is silent while every exempt route is really absent from the build", async () => {
    expect(staleExemptions(await distFrom(valid))).toEqual([]);
  });

  it("names a route that is listed as on demand but now has a file", async () => {
    const issues = staleExemptions(
      await distFrom({ ...valid, "search/index.html": "<html></html>", "llms.txt": "x" }),
    );
    expect(issues.join("\n")).toContain("/search/");
    expect(issues.join("\n")).toContain("/llms.txt");
  });
});
