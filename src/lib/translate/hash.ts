import { createHash } from "node:crypto";
import { FENCE, SCHEMAS, collectStringFields, splitFrontmatter } from "./fields";
import type { TranslateCollection } from "./site-config";

export const sha256 = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/** No trailing whitespace on any line, no trailing blank lines. */
const normalizeBody = (body: string): string =>
  body
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();

/**
 * `sourceHash` of an EN twin: a hash of what the pipeline translates from the
 * RU file — the body and the translatable frontmatter fields of `collection`
 * (see ./fields.ts). Everything else (`updatedDate`, `keywords`, `tags`,
 * `cover`, …) can change without making the twin stale.
 *
 * Values are hashed after YAML parsing, so quoting, folded scalars and key
 * order do not matter. A BOM, CRLF line endings, trailing whitespace and empty
 * fields are normalised away: the admin form drops empty `summary` /
 * `coverAlt` and rewrites the file on every save.
 */
export const contentHash = (collection: TranslateCollection, source: string): string => {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const { rawData, body } = FENCE.test(text) ? splitFrontmatter(text) : { rawData: {}, body: text };
  const fields = Object.entries(collectStringFields(rawData, SCHEMAS[collection]))
    .filter(([, value]) => value.trim() !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(JSON.stringify({ body: normalizeBody(body), fields }));
};
