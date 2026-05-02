import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Compare from "~/components/mdx/Compare.astro";

const sample = {
  cols: ["Sonnet", "Opus", "Haiku"],
  rows: [
    { label: "Latency p50", values: ["1.2s", "2.4s", "0.5s"] },
    { label: "Cost / 1M tok", values: ["$3", "$15", "$0.80"] },
  ],
  verdict: "Sonnet — лучший дефолт; Opus — для глубокого reasoning; Haiku — для классификации.",
  caption: "Сравнение моделей Claude по латентности и цене",
};

describe("<Compare>", () => {
  it("emits a <figure> wrapping a <table> with header row", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<figure[^>]+class="compare"/);
    expect(html).toMatch(/<table\b/);
    expect(html).toMatch(/<thead\b[\s\S]+<th[\s\S]+Sonnet[\s\S]+Opus[\s\S]+Haiku/);
  });

  it('renders one <tr> per row with label as <th scope="row">', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<th scope="row"[^>]*>Latency p50<\/th>/);
    expect(html).toMatch(/<th scope="row"[^>]*>Cost \/ 1M tok<\/th>/);
    expect(html).toMatch(/<td[^>]*>\$15<\/td>/);
  });

  it("renders <figcaption> from caption prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<figcaption[^>]*>Сравнение моделей/);
  });

  it("renders a verdict line below the table", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<p[^>]+class="compare__verdict"[^>]*>Sonnet — лучший/);
  });

  it("throws when row.values length mismatches cols length", async () => {
    const bad = {
      cols: ["A", "B"],
      rows: [{ label: "x", values: ["1"] }],
      verdict: "v",
    };
    const container = await AstroContainer.create();
    await expect(container.renderToString(Compare, { props: bad })).rejects.toThrow(
      /column count mismatch/i,
    );
  });
});
