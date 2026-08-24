import { describe, expect, it } from "vitest";
import {
  appendVary,
  negotiateRepresentation,
  type Representation,
} from "~/lib/http/content-negotiation";

describe("Accept content negotiation", () => {
  it.each<[string | null, Representation | null]>([
    [null, "text/html"],
    ["", "text/html"],
    ["*/*", "text/html"],
    ["text/html", "text/html"],
    ["text/markdown", "text/markdown"],
    ["text/markdown, text/html;q=0.8", "text/markdown"],
    ["text/html, text/markdown", "text/html"],
    ["text/html;q=0.5, text/markdown;q=0.9", "text/markdown"],
    ["text/*;q=0.7, text/markdown;q=0.8", "text/markdown"],
    ["*/*;q=1, text/markdown;q=1", "text/markdown"],
    ["text/markdown;q=0, text/html", "text/html"],
    ["text/markdown;q=0, */*;q=0.5", "text/html"],
    ["text/html;q=0, text/markdown;q=0, */*;q=1", null],
    ["application/pdf", null],
    [
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "text/html",
    ],
    ["TEXT/MARKDOWN;Q=1, text/html;q=0.5", "text/markdown"],
  ])("chooses the supported representation for %j", (accept, expected) => {
    expect(negotiateRepresentation(accept)).toBe(expected);
  });

  it("adds both cache keys without duplicating existing Vary tokens", () => {
    const headers = new Headers({ Vary: "Origin, accept-encoding" });

    appendVary(headers, "Accept", "Accept-Encoding");
    appendVary(headers, "accept", "ACCEPT-ENCODING");

    expect(headers.get("Vary")).toBe("Origin, accept-encoding, Accept");
  });
});
