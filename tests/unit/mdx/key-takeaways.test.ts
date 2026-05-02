import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import KeyTakeaways from "~/components/mdx/KeyTakeaways.astro";

const items = [
  "harness ≠ agent — это контейнер для агентного цикла",
  "skills грузятся по триггеру и не жгут токены вхолостую",
  "subagent-ы заводи только когда summary важнее транскрипта",
];

describe("<KeyTakeaways>", () => {
  it("renders an <ul> with one <li> per takeaway", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, { props: { items } });
    const liCount = (html.match(/<li\b/g) ?? []).length;
    expect(liCount).toBe(3);
    expect(html).toContain("harness ≠ agent");
    expect(html).toContain("skills грузятся по триггеру");
  });

  it("uses an aside with labelled section semantics", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, { props: { items } });
    expect(html).toMatch(/<aside[^>]+class="takeaways"/);
    expect(html).toMatch(/aria-label/);
  });

  it("warns at build time when items count is outside 3-5", async () => {
    const container = await AstroContainer.create();
    await expect(
      container.renderToString(KeyTakeaways, { props: { items: ["one"] } }),
    ).rejects.toThrow(/3.*5 takeaways/i);
    await expect(
      container.renderToString(KeyTakeaways, {
        props: { items: ["a", "b", "c", "d", "e", "f"] },
      }),
    ).rejects.toThrow(/3.*5 takeaways/i);
  });

  it("accepts a custom title prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, {
      props: { items, title: "Главное" },
    });
    expect(html).toContain("Главное");
  });
});
