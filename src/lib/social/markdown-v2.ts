const RESERVED_CHARS = new Set("_*[]()~`>#+-=|{}.!\\");

/**
 * Returns end index (exclusive) of a formatter span starting at `i`, or -1 if not a formatter.
 * Formatter spans: `**bold**`, `*italic*`, `` `code` ``, `[label](url)`.
 */
const findFormatterEnd = (text: string, i: number): number => {
  if (text.startsWith("**", i)) {
    const end = text.indexOf("**", i + 2);
    return end === -1 ? -1 : end + 2;
  }
  if (text[i] === "*") {
    const end = text.indexOf("*", i + 1);
    return end === -1 ? -1 : end + 1;
  }
  if (text[i] === "`") {
    const end = text.indexOf("`", i + 1);
    return end === -1 ? -1 : end + 1;
  }
  if (text[i] === "[") {
    const labelEnd = text.indexOf("]", i + 1);
    if (labelEnd === -1 || text[labelEnd + 1] !== "(") return -1;
    const urlEnd = text.indexOf(")", labelEnd + 2);
    return urlEnd === -1 ? -1 : urlEnd + 1;
  }
  return -1;
};

/**
 * Escape user text for MarkdownV2 outside of formatter spans.
 * Existing formatters (`**bold**`, `*italic*`, backtick code, link) pass through unchanged.
 */
export const escapeMarkdownV2 = (text: string): string => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const formatterEnd = findFormatterEnd(text, i);
    if (formatterEnd !== -1) {
      out += text.slice(i, formatterEnd);
      i = formatterEnd;
      continue;
    }
    const ch = text[i]!;
    if (RESERVED_CHARS.has(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  return out;
};

type ValidateResult = { ok: true } | { ok: false; issues: string[] };

/**
 * Validate that a MarkdownV2 string is well-formed:
 * - all reserved chars outside formatter spans are escaped
 * - bold spans (`**...**`) are balanced (even count of unescaped `**`)
 */
export const validateMarkdownV2 = (text: string): ValidateResult => {
  const issues: string[] = [];

  // Bold balance: count unescaped `**` — must be even.
  const boldMatches = text.match(/(?<!\\)\*\*/g) ?? [];
  if (boldMatches.length % 2 !== 0) issues.push("unbalanced bold (`**`)");

  // Walk and verify no unescaped reserved char outside formatter spans.
  let i = 0;
  while (i < text.length) {
    const formatterEnd = findFormatterEnd(text, i);
    if (formatterEnd !== -1) {
      i = formatterEnd;
      continue;
    }
    const ch = text[i]!;
    if (ch === "\\") {
      // escape prefix — skip next char (it is escaped, regardless of what it is)
      i += 2;
      continue;
    }
    if (RESERVED_CHARS.has(ch)) {
      issues.push(`unescaped reserved char "${ch}" at index ${i}`);
    }
    i += 1;
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};
