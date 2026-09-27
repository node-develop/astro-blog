/**
 * Join class names, skipping falsy parts. Keeps conditional modifiers out of
 * string literals, where a formatter can trim the separating space.
 */
export const cx = (...parts: readonly (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
