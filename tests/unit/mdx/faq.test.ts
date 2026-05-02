import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Faq from "~/components/mdx/Faq.astro";

const sampleItems = [
  { question: "Что такое harness?", answer: "Это runtime-контейнер, в котором живёт LLM-цикл." },
  {
    question: "Что такое skill?",
    answer: "Файл-инструкция, который Claude активирует по триггеру.",
  },
];

describe("<Faq>", () => {
  it("renders one <details> per item with the question as <summary>", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: sampleItems } });
    const detailsCount = (html.match(/<details\b/g) ?? []).length;
    expect(detailsCount).toBe(2);
    expect(html).toContain("Что такое harness?");
    expect(html).toContain("Что такое skill?");
    expect(html).toContain("Это runtime-контейнер");
  });

  it("uses a labelled section with H2 heading", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: sampleItems } });
    expect(html).toMatch(/<section[^>]+class="faq"/);
    expect(html).toMatch(/<h2[^>]*>FAQ<\/h2>/);
  });

  it("renders nothing when items array is empty", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: [] } });
    expect(html).not.toMatch(/<section[^>]+class="faq"/);
    expect(html).not.toMatch(/<details\b/);
  });

  it("accepts a custom title prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, {
      props: { items: sampleItems, title: "Часто задаваемые" },
    });
    expect(html).toContain("Часто задаваемые");
  });
});
