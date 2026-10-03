import { describe, expect, it } from "vitest";
import { matchRoute, routes } from "~/lib/content-api/routes";

const id = "349ad05b-41ae-4b63-93ab-d7679c82c886";
const hit = (method: string, path: string) => {
  const match = matchRoute(routes, method, path);
  return match && { pattern: match.route.pattern, params: match.params };
};

describe("matchRoute over the real route table", () => {
  it("captures :id and maps each method to its own route", () => {
    expect(hit("GET", `articles/${id}`)).toEqual({ pattern: "articles/:id", params: { id } });
    expect(hit("PUT", `articles/${id}`)).toEqual({ pattern: "articles/:id", params: { id } });
    expect(hit("POST", `articles/${id}/publish`)).toEqual({
      pattern: "articles/:id/publish",
      params: { id },
    });
    expect(hit("GET", `publications/${id}`)?.pattern).toBe("publications/:id");
  });

  it("matches the literal articles/validate before articles/:id", () => {
    expect(hit("POST", "articles/validate")?.pattern).toBe("articles/validate");
    // Other methods fall through to the :id route, as the old regex dispatcher did.
    expect(hit("GET", "articles/validate")).toEqual({
      pattern: "articles/:id",
      params: { id: "validate" },
    });
  });

  it("sends articles/by-slug/versions to by-slug, not to the versions route", () => {
    expect(hit("GET", "articles/by-slug/versions")).toEqual({
      pattern: "articles/by-slug/:slug",
      params: { slug: "versions" },
    });
    expect(hit("GET", `articles/${id}/versions`)).toEqual({
      pattern: "articles/:id/versions",
      params: { id },
    });
    expect(hit("GET", `articles/${id}/versions/3`)).toEqual({
      pattern: "articles/:id/versions/:n",
      params: { id, n: "3" },
    });
  });

  it("sends a bare articles/by-slug to the :id route, not to a by-slug route", () => {
    expect(hit("GET", "articles/by-slug")).toEqual({
      pattern: "articles/:id",
      params: { id: "by-slug" },
    });
  });

  it("ignores one trailing slash", () => {
    expect(hit("POST", "articles/")?.pattern).toBe("articles");
    expect(hit("GET", "whoami/")?.pattern).toBe("whoami");
  });

  it.each([
    ["PATCH", `articles/${id}`],
    ["POST", `articles/${id}`],
    ["GET", `articles/${id}/publish`],
    ["GET", "articles//publish"],
    ["GET", `articles/${id}/extra/segment`],
    ["GET", "nothing"],
    ["GET", ""],
  ])("does not match %s %s", (method, path) => {
    expect(matchRoute(routes, method, path)).toBeNull();
  });
});
