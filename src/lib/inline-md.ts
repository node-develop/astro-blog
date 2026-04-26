/**
 * Minimal inline-markdown renderer for frontmatter strings.
 *
 * Only for trusted input (frontmatter): no sanitisation beyond basic HTML
 * escaping is performed. Do NOT pass user-supplied strings.
 */

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (raw: string): string =>
  raw.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);

/**
 * Renders inline backtick code spans in a frontmatter description string.
 *
 * Processing order (critical):
 * 1. HTML-escape the whole string so any `<`, `>`, `&` in the raw text are safe.
 * 2. Replace paired backticks with `<code>…</code>` in the already-escaped
 *    string, so the injected tags are not themselves escaped.
 *
 * Unpaired backticks are left as-is (regex only matches pairs).
 *
 * Only for trusted input (frontmatter).
 */
export const renderInlineCode = (raw: string): string => {
  const escaped = escapeHtml(raw);
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
};
