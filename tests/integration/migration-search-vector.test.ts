import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

/**
 * Migration 0009 lands on a database where the worker has written one vector per slug from
 * whichever language was verified last. What it must get right is the data: each language column
 * ends up holding its own language, from the document that was published.
 */
const MIGRATION = "0009_search_vector_per_lang.sql";

describe("migration 0009 on a database with mixed-language search vectors", () => {
  let container: StartedPostgreSqlContainer;
  let sql: ReturnType<typeof postgres>;
  let keyId = "";

  const apply = async (file: string): Promise<void> => {
    const text = await readFile(join(process.cwd(), "drizzle", file), "utf8");
    await sql.unsafe(text.replaceAll(/-->\s*statement-breakpoint/g, ""));
  };
  const doc = (title: string, body: string) => sql.json({ title, tags: ["alpha", "beta"], body });
  const article = async (
    slug: string,
    lang: string,
    current: { title: string; body: string },
    publishedVersion: number | null,
    published?: { title: string; body: string },
  ) => {
    const [row] = await sql`insert into content_articles
      (external_id, lang, slug, version, document, published_version, key_id)
      values (${slug}, ${lang}, ${slug}, 2, ${doc(current.title, current.body)},
              ${publishedVersion}, ${keyId}) returning id`;
    if (published)
      await sql`insert into content_article_versions (article_id, version, document, actor_key_id)
        values (${row!.id}, 1, ${doc(published.title, published.body)}, ${keyId})`;
  };
  const meta = async (slug: string, order: number, text: string) => {
    await sql`insert into posts_meta (slug, "order", search_vector)
      values (${slug}, ${order}, to_tsvector('simple', ${text}))`;
  };
  const hits = async (slug: string, column: string, word: string): Promise<boolean> => {
    const [row] = await sql.unsafe(
      `select ${column} @@ plainto_tsquery('simple', $1) as hit from posts_meta where slug = $2`,
      [word, slug],
    );
    return row!.hit === true;
  };
  const vectorText = async (slug: string): Promise<string | null> => {
    const [row] = await sql`select search_vector::text as v from posts_meta where slug = ${slug}`;
    return row!.v;
  };

  const before = new Map<string, string | null>();
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
    const files = (await readdir(join(process.cwd(), "drizzle")))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files.filter((file) => file < MIGRATION)) await apply(file);

    const [key] = await sql`insert into content_api_keys (name, token_hash, scopes)
      values ('agent', ${"a".repeat(64)}, '["articles:write"]'::jsonb) returning id`;
    keyId = key!.id;
    // Both languages published; the current RU document is newer than the published one, and the
    // vector holds English text because the English page was verified last.
    await article("both", "ru", { title: "Новый", body: "свёкла" }, 1, {
      title: "Старый",
      body: "борщ",
    });
    await article("both", "en", { title: "Title", body: "dumplings" }, 1);
    await meta("both", 1, "dumplings");
    // English published, no Russian API article: the Russian vector may be English text.
    await article("en-only", "en", { title: "Title", body: "pancakes" }, 1);
    await meta("en-only", 2, "pancakes");
    // A file post and an unpublished API draft: nothing to recompute, nothing to touch.
    await meta("file-only", 3, "блины");
    await article("draft", "ru", { title: "Черновик", body: "каша" }, null);
    await meta("draft", 4, "каша");
    for (const slug of ["file-only", "draft"]) before.set(slug, await vectorText(slug));

    await apply(MIGRATION);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await container?.stop();
  });

  it("gives each language column its own text, from the published version of the document", async () => {
    expect(await hits("both", "search_vector", "борщ")).toBe(true);
    expect(await hits("both", "search_vector", "свёкла")).toBe(false);
    expect(await hits("both", "search_vector", "dumplings")).toBe(false);
    expect(await hits("both", "search_vector_en", "dumplings")).toBe(true);
    expect(await hits("both", "search_vector_en", "борщ")).toBe(false);
    // Title and tags are indexed as well as the body.
    expect(await hits("both", "search_vector", "старый")).toBe(true);
    expect(await hits("both", "search_vector_en", "beta")).toBe(true);
  });

  it("clears a Russian vector that cannot be Russian instead of keeping English text", async () => {
    expect(await vectorText("en-only")).toBeNull();
    expect(await hits("en-only", "search_vector_en", "pancakes")).toBe(true);
  });

  it("leaves file posts and unpublished drafts exactly as they were", async () => {
    for (const slug of ["file-only", "draft"])
      expect(await vectorText(slug)).toBe(before.get(slug));
    const rows = await sql`select slug, search_vector_en from posts_meta
      where slug in ('file-only', 'draft')`;
    expect(rows.map((row) => row.search_vector_en)).toEqual([null, null]);
  });
});
