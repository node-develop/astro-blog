import type { Element, Root } from "hast";
import focusableTables from "~/lib/rehype/focusable-tables";

const table = (properties: Element["properties"] = {}): Element => ({
  type: "element",
  tagName: "table",
  properties,
  children: [],
});

it("makes every Markdown table keyboard-focusable (axe: scrollable-region-focusable)", async () => {
  const plain = table();
  const nested = table();
  const wrapper: Element = { type: "element", tagName: "div", properties: {}, children: [nested] };
  const tree: Root = { type: "root", children: [plain, wrapper] };

  await focusableTables()(tree, undefined);

  expect(plain.properties.tabIndex).toBe(0);
  expect(nested.properties.tabIndex).toBe(0);
});

it("keeps an explicit tabindex and leaves other elements alone", async () => {
  const custom = table({ tabIndex: -1 });
  const div: Element = { type: "element", tagName: "div", properties: {}, children: [] };
  const tree: Root = { type: "root", children: [custom, div] };

  await focusableTables()(tree, undefined);

  expect(custom.properties.tabIndex).toBe(-1);
  expect(div.properties.tabIndex).toBeUndefined();
});
