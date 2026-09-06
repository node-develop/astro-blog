import { describe, expect, it } from "vitest";
import { twitterHandleFromSameAs } from "~/lib/seo/social";
import { person } from "~/lib/seo/person";

describe("twitterHandleFromSameAs", () => {
  it("derives @handle from the X profile URL in sameAs", () => {
    expect(twitterHandleFromSameAs(["https://github.com/x", "https://x.com/artkadev"])).toBe(
      "@artkadev",
    );
    expect(twitterHandleFromSameAs(["https://twitter.com/foo_bar/"])).toBe("@foo_bar");
  });

  it("returns null when no X profile or the path is not a handle", () => {
    expect(twitterHandleFromSameAs(["https://github.com/x"])).toBeNull();
    expect(twitterHandleFromSameAs(["https://x.com/"])).toBeNull();
    expect(twitterHandleFromSameAs(["not a url"])).toBeNull();
  });

  it("resolves the site author's real handle", () => {
    expect(twitterHandleFromSameAs(person.sameAs)).toBe("@artkadev");
  });
});
