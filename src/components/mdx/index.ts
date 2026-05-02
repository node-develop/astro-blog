// Central re-export of MDX components. PostLayout passes this map to
// <Content components={...} /> so MD/MDX authors can use the tags as
// globals — no per-file imports.
//
// Adding a component:
//   1. Create `src/components/mdx/<Name>.astro`.
//   2. Re-export it here.
//   3. PostLayout will pick it up automatically via the spread.

import Tldr from "./Tldr.astro";
import Faq from "./Faq.astro";
import Compare from "./Compare.astro";
import Definition from "./Definition.astro";
import KeyTakeaways from "./KeyTakeaways.astro";

export const mdxComponents = {
  Tldr,
  Faq,
  Compare,
  Definition,
  KeyTakeaways,
} as const;

export type MdxComponents = typeof mdxComponents;
