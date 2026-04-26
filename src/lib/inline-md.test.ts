import { describe, expect, it } from "vitest";
import { renderInlineCode } from "./inline-md.js";

describe("renderInlineCode", () => {
  it("returns empty string unchanged", () => {
    expect(renderInlineCode("")).toBe("");
  });

  it("returns plain text without backticks unchanged", () => {
    expect(renderInlineCode("hello world")).toBe("hello world");
  });

  it("wraps a single backtick span in <code>", () => {
    expect(renderInlineCode("see `CLAUDE.md` here")).toBe("see <code>CLAUDE.md</code> here");
  });

  it("wraps multiple backtick spans in <code>", () => {
    expect(renderInlineCode("use `foo` and `bar`")).toBe(
      "use <code>foo</code> and <code>bar</code>",
    );
  });

  it("HTML-escapes angle brackets and ampersands before code substitution", () => {
    expect(renderInlineCode("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("HTML-escapes outer tags while converting inner backticks", () => {
    expect(renderInlineCode("<b>see `x`</b>")).toBe("&lt;b&gt;see <code>x</code>&lt;/b&gt;");
  });

  it("leaves an unpaired backtick as-is", () => {
    expect(renderInlineCode("a lone ` backtick")).toBe("a lone ` backtick");
  });

  it("HTML-escapes double quotes and single quotes", () => {
    expect(renderInlineCode(`say "hi" & 'bye'`)).toBe("say &quot;hi&quot; &amp; &#39;bye&#39;");
  });

  it("does not double-escape the injected <code> tags", () => {
    const result = renderInlineCode("`test`");
    expect(result).toBe("<code>test</code>");
    expect(result).not.toContain("&lt;code&gt;");
  });
});
