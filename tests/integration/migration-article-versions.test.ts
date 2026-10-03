import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { ADMIN_SESSION_KEY_NAME, ADMIN_SESSION_TOKEN_HASH } from "~/lib/db/schema";

/**
 * Migration 0008 lands on a database that already holds API articles. What it
 * must get right is the data, not the DDL: history starts from the current
 * document, the build pointer follows the last verified publication, and old
 * publications do not fire post-publish hooks retroactively.
 */
const MIGRATION = "0008_article_versions_build_pointer.sql";

describe("migration 0008 on a database with existing API content", () => {
  let container: StartedPostgreSqlContainer;
  let sql: ReturnType<typeof postgres>;
  const ids = { key: "", article: "", draft: "", published: "", failed: "", queued: "" };

  const apply = async (file: string): Promise<void> => {
    const text = await readFile(join(process.cwd(), "drizzle", file), "utf8");
    await sql.unsafe(text.replaceAll(/-->\s*statement-breakpoint/g, ""));
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
    const files = (await readdir(join(process.cwd(), "drizzle")))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files.filter((file) => file < MIGRATION)) await apply(file);

    const doc = (title: string) => sql.json({ title });
    const [key] = await sql`insert into content_api_keys (name, token_hash, scopes)
      values ('agent', ${"a".repeat(64)}, '["articles:write"]'::jsonb) returning id`;
    ids.key = key!.id;
    const [article] = await sql`insert into content_articles
      (external_id, lang, slug, version, document, published_version, key_id, updated_at)
      values ('x', 'ru', 'x', 3, ${doc("third save")}, 2, ${ids.key}, '2026-09-01T00:00:00Z')
      returning id`;
    ids.article = article!.id;
    const [draft] = await sql`insert into content_articles
      (external_id, lang, slug, version, document, key_id)
      values ('y', 'ru', 'y', 1, ${doc("draft")}, ${ids.key}) returning id`;
    ids.draft = draft!.id;
    const publication = async (state: string, version: number, createdAt: string) => {
      const [row] = await sql`insert into content_publications
        (article_id, version, content, state, key_id, created_at, updated_at)
        values (${ids.article}, ${version}, 'md', ${state}, ${ids.key}, ${createdAt}, ${createdAt})
        returning id`;
      return row!.id as string;
    };
    ids.published = await publication("published", 2, "2026-08-01T00:00:00Z");
    ids.failed = await publication("failed", 3, "2026-08-02T00:00:00Z");
    ids.queued = await publication("queued", 3, "2026-08-03T00:00:00Z");

    await apply(MIGRATION);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await container?.stop();
  });

  it("starts each article's history from its current document and version", async () => {
    const versions = await sql`select article_id, version, document->>'title' as title, actor_key_id
      from content_article_versions order by version`;
    expect(versions.map((v) => [v.article_id, v.version, v.title, v.actor_key_id])).toEqual([
      [ids.draft, 1, "draft", ids.key],
      [ids.article, 3, "third save", ids.key],
    ]);
  });

  it("points the build at the last verified publication, and at nothing for a draft", async () => {
    const rows = await sql`select id, build_publication_id, last_modified_at, manually_edited
      from content_articles`;
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(ids.article)!.build_publication_id).toBe(ids.published);
    expect(byId.get(ids.draft)!.build_publication_id).toBeNull();
    // Not the moment of the migration: the last save.
    expect(byId.get(ids.article)!.last_modified_at.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(byId.get(ids.article)!.manually_edited).toBe(false);
  });

  it("marks finished publications as hook-complete and leaves active ones pending", async () => {
    const rows = await sql`select id, kind, hooks_done_at from content_publications`;
    const done = new Map(rows.map((row) => [row.id, row.hooks_done_at !== null]));
    expect([done.get(ids.published), done.get(ids.failed), done.get(ids.queued)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(["publish"]));
  });

  it("creates the admin-session key under the hash the code looks it up by", async () => {
    const [row] = await sql`select token_hash, revoked_at from content_api_keys
      where name = ${ADMIN_SESSION_KEY_NAME}`;
    expect(row!.token_hash).toBe(ADMIN_SESSION_TOKEN_HASH);
    expect(row!.revoked_at).toBeNull();
  });

  it("rejects a publication kind other than publish or unpublish", async () => {
    await expect(
      sql`insert into content_publications (article_id, version, content, kind, key_id, state)
        values (${ids.draft}, 1, 'md', 'archive', ${ids.key}, 'failed')`,
    ).rejects.toThrow(/content_publications_kind_check/);
  });
});
