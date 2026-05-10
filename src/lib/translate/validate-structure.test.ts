import { describe, it, expect } from "vitest";
import { findStructuralMismatches, formatMismatchSummary } from "./validate-structure";

describe("findStructuralMismatches", () => {
  it("returns empty when bold and code spans are balanced", () => {
    const result = findStructuralMismatches(
      [{ id: 0, text: "**bold** and `code`", kind: "prose" }],
      [{ id: 0, text: "**жирный** и `код`" }],
    );
    expect(result).toEqual([]);
  });

  it("flags missing closing ** when bold ends with internal punctuation", () => {
    // Reproduces the actually-observed translator bug:
    // RU `**фраза."** Если...` was returned as `**phrase." If...` by Haiku.
    const result = findStructuralMismatches(
      [{ id: 0, text: "**Каждое правило отвечает на «X».** Если не отвечает.", kind: "prose" }],
      [{ id: 0, text: '**Each rule answers "X." If not.' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 0,
      marker: "**",
      sourceCount: 2,
      translatedCount: 1,
    });
  });

  it("flags missing backtick", () => {
    const result = findStructuralMismatches(
      [{ id: 0, text: "use `npm install`", kind: "prose" }],
      [{ id: 0, text: "use `npm install" }],
    );
    expect(result.find((m) => m.marker === "`")).toMatchObject({
      sourceCount: 2,
      translatedCount: 1,
    });
  });

  it("ignores mermaid placeholders (markers there are diagram syntax, not bold)", () => {
    const result = findStructuralMismatches(
      [{ id: 0, text: "flowchart LR\n  A[**x**] --> B", kind: "mermaid" }],
      [{ id: 0, text: "flowchart LR\n  A[**y] --> B" }],
    );
    expect(result).toEqual([]);
  });

  it("ignores translated entries with no matching source id", () => {
    const result = findStructuralMismatches(
      [{ id: 0, text: "x", kind: "prose" }],
      [{ id: 99, text: "**unbalanced" }],
    );
    expect(result).toEqual([]);
  });

  it("returns mismatches per marker per id (one entry can have multiple)", () => {
    const result = findStructuralMismatches(
      [{ id: 0, text: "**bold** and `code`", kind: "prose" }],
      [{ id: 0, text: "**bold and code" }],
    );
    expect(result).toHaveLength(2);
    const markers = result.map((m) => m.marker).sort();
    expect(markers).toEqual(["**", "`"]);
  });
});

describe("formatMismatchSummary", () => {
  it("renders a compact one-line summary for error messages", () => {
    const summary = formatMismatchSummary([
      { id: 5, marker: "**", sourceCount: 4, translatedCount: 3 },
      { id: 7, marker: "`", sourceCount: 2, translatedCount: 0 },
    ]);
    expect(summary).toBe("id=5 '**': source=4 translated=3; id=7 '`': source=2 translated=0");
  });
});
