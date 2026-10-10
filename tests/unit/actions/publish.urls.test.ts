import { describe, expect, it } from "vitest";
import { publishedUrlsFor } from "~/lib/seo/indexnow";

describe("publishedUrlsFor (IndexNow url set)", () => {
  it("post with EN twin: both locales plus both blog indexes, canonical trailing slash", () => {
    expect(publishedUrlsFor("posts", "claude-md-12-rules", true)).toEqual([
      "/blog/claude-md-12-rules/",
      "/en/blog/claude-md-12-rules/",
      "/blog/",
      "/en/blog/",
    ]);
  });

  it("post without EN twin omits the EN page but keeps the EN index", () => {
    expect(publishedUrlsFor("posts", "only-ru", false)).toEqual([
      "/blog/only-ru/",
      "/blog/",
      "/en/blog/",
    ]);
  });

  it("home maps to the two locale roots", () => {
    expect(publishedUrlsFor("site", "home", true)).toEqual(["/", "/en/"]);
  });
});
