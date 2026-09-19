import { describe, expect, it } from "vitest";
import { ogTree } from "~/lib/og/og-image";
import { person } from "~/lib/seo/person";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** Every text node Satori would draw, in document order. */
const texts = (node: unknown): ReadonlyArray<string> => {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isRecord(node) || !isRecord(node.props)) return [];
  return texts(node.props.children);
};

describe("OG card byline", () => {
  const TITLE = "How the card is signed";
  const GUEST = "Guest Writer";

  it("signs a card with the canonical author when no byline is given", () => {
    expect(texts(ogTree({ title: TITLE }))).toContain(person.name);
    expect(ogTree({ title: TITLE })).toEqual(ogTree({ title: TITLE, byline: person.name }));
  });

  it("renders an explicit byline instead of the canonical author", () => {
    const drawn = texts(ogTree({ title: TITLE, byline: GUEST }));

    expect(drawn).toContain(GUEST);
    expect(drawn).not.toContain(person.name);
  });
});
