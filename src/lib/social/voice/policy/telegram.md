# Telegram policy rules

- MarkdownV2 only. The following characters MUST be escaped with a backslash: `_*[]()~\`>#+-=|{}.!`
  (Validation in src/lib/social/markdown-v2.ts.)
- 200 ≤ length ≤ 600 characters (excluding escapes).
- Lead with one emoji + bold hook on line 1.
- Final line: link to the article, no preview (`disable_web_page_preview=true`).
- 0 hashtags. Telegram doesn't reward them.
- No fake CTAs ("Click NOW", "Like if you agree").
