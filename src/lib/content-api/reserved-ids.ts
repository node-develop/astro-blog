/**
 * Element ids the layouts own. rehype-slug gives every body heading an id from its text, so a
 * heading that slugs to one of these duplicates a layout id and fails the build's html-validate
 * `no-dup-id` rule (an EN `## Main` against `<main id="main">`). One list, read by the editorial
 * gate; keep it in step with the `id=` attributes of `src/layouts` and `src/components`.
 */
export const RESERVED_ELEMENT_IDS: ReadonlySet<string> = new Set([
  "main",
  "site-drawer",
  "site-title",
  "faq-heading",
  "related-heading",
  "comments-heading",
  "newsletter-heading",
  "booking-heading",
  "latest-label",
  "footnote-label",
]);

/** Also the `mermaid-0`, `mermaid-1`, ... ids the diagram renderer numbers. */
export const isReservedElementId = (id: string): boolean =>
  RESERVED_ELEMENT_IDS.has(id) || /^mermaid-\d+$/.test(id);
