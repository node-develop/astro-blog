import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Tldr from "~/components/mdx/Tldr.astro";

describe("<Tldr>", () => {
  it("renders a labelled aside with the prose payload", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {
      slots: { default: "В двух словах: harness отличается от агента." },
    });
    expect(html).toContain('class="tldr"');
    expect(html).toMatch(/<aside\b/);
    expect(html).toContain("В двух словах");
    // a11y: aside must be labelled
    expect(html).toMatch(/aria-label="(TL;DR|tldr|TLDR)"/i);
  });

  it("renders a `text` prop when no slot is provided", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {
      props: { text: "Краткое содержание." },
    });
    expect(html).toContain("Краткое содержание");
  });

  it("renders nothing when neither prop nor slot is provided", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {});
    // Guard: an empty Tldr must not emit a stray <aside>
    expect(html).not.toMatch(/<aside\b/);
  });
});
