import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Definition from "~/components/mdx/Definition.astro";

describe("<Definition>", () => {
  it("renders a <dl> with <dt> and <dd>", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "Harness" },
      slots: { default: "Runtime-контейнер LLM-цикла." },
    });
    expect(html).toMatch(/<dl[^>]+class="definition"/);
    expect(html).toMatch(/<dt[^>]*>Harness<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>[\s\S]*Runtime-контейнер[\s\S]*<\/dd>/);
  });

  it("escapes the term to prevent HTML injection", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "<script>alert(1)</script>" },
      slots: { default: "evil" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it("renders nothing when term is empty", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "" },
      slots: { default: "x" },
    });
    expect(html).not.toMatch(/<dl[^>]+class="definition"/);
  });
});
