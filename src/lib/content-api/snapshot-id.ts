import { createHash } from "node:crypto";

/**
 * Pure on purpose (node:crypto only): export.ts imports the content loader and so `astro:content`,
 * which scripts such as the fixture generator cannot load.
 */
export type ManifestEntry = Readonly<{
  slug: string;
  lang: "ru" | "en";
  /** The publication whose content the build must contain. */
  revision: string;
  order: number;
  pinned: boolean;
  hiddenFromList: boolean;
}>;

// Code units, not a database collation: the order must not depend on how PostgreSQL sorts a hyphen.
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const sortedManifest = (manifest: readonly ManifestEntry[]): readonly ManifestEntry[] =>
  [...manifest].sort((a, b) => compare(a.slug, b.slug) || compare(a.lang, b.lang));

/** A deterministic UUIDv8 (version and variant bits set) from the first 16 bytes of sha256(seed). */
export const uuidV8 = (seed: string): string => {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * UUIDv8 over the sorted revisions and meta: the same desired state always has the same id,
 * whatever order the rows came in. A revision is immutable, so the id fixes `articles`.
 * `generatedAt` is deliberately outside it.
 */
export const snapshotIdOf = (manifest: readonly ManifestEntry[]): string =>
  uuidV8(
    JSON.stringify([
      "export-v1",
      ...sortedManifest(manifest).map((e) => [
        e.slug,
        e.lang,
        e.revision,
        e.order,
        e.pinned,
        e.hiddenFromList,
      ]),
    ]),
  );
