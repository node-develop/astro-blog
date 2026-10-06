/**
 * One convention for every check: a check returns `readonly string[]`, one entry per problem.
 * Many pages hit by one rule are folded into a single entry so a run reports a rule once
 * with its URL list instead of a screenful of the same sentence.
 */

/** `"<rule>: <message>\n  - <url>..."`, one entry per distinct message in first-seen order. */
export const grouped = (
  rule: string,
  findings: ReadonlyArray<readonly [message: string, url: string]>,
): string[] => {
  const byMessage = new Map<string, string[]>();
  for (const [message, url] of findings) {
    byMessage.set(message, [...(byMessage.get(message) ?? []), url]);
  }
  return [...byMessage.entries()].map(
    ([message, urls]) => `${rule}: ${message}\n${urls.map((url) => `  - ${url}`).join("\n")}`,
  );
};
