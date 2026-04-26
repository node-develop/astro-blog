import { sql, type SQL } from "drizzle-orm";

export interface SearchVectorParts {
  readonly title: string;
  readonly tags: readonly string[];
  readonly body: string;
}

/**
 * Builds an SQL fragment that produces a weighted tsvector from
 * title (A), tags joined with spaces (B), and body (C). All input
 * is passed through unaccent() for diacritic-insensitive matching.
 *
 * Use as the value for postsMeta.searchVector in an UPDATE/INSERT.
 */
export function buildSearchVectorSql(parts: SearchVectorParts): SQL {
  const tagsString = parts.tags.join(" ");
  return sql`
    setweight(to_tsvector('simple', unaccent(${parts.title})), 'A') ||
    setweight(to_tsvector('simple', unaccent(${tagsString})), 'B') ||
    setweight(to_tsvector('simple', unaccent(${parts.body})), 'C')
  `;
}
