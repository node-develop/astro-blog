import { describe, expect, it } from "vitest";
import { ifMatchVersion } from "~/lib/content-api/http";

const withHeader = (value?: string) =>
  new Request("https://artka.dev/api/v1/articles/x/", {
    method: "DELETE",
    headers: value === undefined ? {} : { "if-match": value },
  });

describe("ifMatchVersion", () => {
  it('reads a strong quoted version: "3"', () => {
    expect(ifMatchVersion(withHeader('"3"'))).toBe(3);
  });
  it("answers 428 when the header is missing", () => {
    expect(() => ifMatchVersion(withHeader())).toThrowError(
      expect.objectContaining({ status: 428, code: "precondition_required" }),
    );
  });
  it.each(["3", "*", 'W/"3"', '"3", "4"', '"0"', '"03"', '"-1"', '"1e1"', '""', '"1234567890"'])(
    "answers 400 for %s",
    (value) => {
      expect(() => ifMatchVersion(withHeader(value))).toThrowError(
        expect.objectContaining({ status: 400, code: "invalid_if_match" }),
      );
    },
  );
});
