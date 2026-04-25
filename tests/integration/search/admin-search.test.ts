import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

let container: StartedPostgreSqlContainer;
let setSearchVector: typeof import("~/lib/db/repo/posts-meta").setSearchVector;
let searchPostsMeta: typeof import("~/lib/db/repo/posts-meta").searchPostsMeta;
let db: typeof import("~/lib/db").db;
let postsMeta: typeof import("~/lib/db/schema").postsMeta;

describe("admin search (postgres FTS)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm")
      .withDatabase("blog_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();

    // Apply migrations against the container before importing repo modules so
    // the production db proxy (which lazy-resolves DATABASE_URL once) points
    // at our test container.
    const postgres = (await import("postgres")).default;
    const client = postgres(container.getConnectionUri(), { max: 1 });
    const migrationDir = join(process.cwd(), "drizzle");
    const files = (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sqlText = await readFile(join(migrationDir, file), "utf8");
      await client.unsafe(sqlText.replaceAll(/-->\s*statement-breakpoint/g, ""));
    }
    await client.end({ timeout: 5 });

    const repo = await import("~/lib/db/repo/posts-meta");
    setSearchVector = repo.setSearchVector;
    searchPostsMeta = repo.searchPostsMeta;
    const dbModule = await import("~/lib/db");
    db = dbModule.db;
    const schema = await import("~/lib/db/schema");
    postsMeta = schema.postsMeta;

    await db.insert(postsMeta).values([
      { slug: "a", order: 1 },
      { slug: "b", order: 2 },
      { slug: "c", order: 3 },
    ]);
    await setSearchVector("a", {
      title: "Astro components",
      tags: ["astro", "frontend"],
      body: "Working with island components in Astro 5.",
    });
    await setSearchVector("b", {
      title: "Postgres tuning",
      tags: ["postgres", "database"],
      body: "Indexing strategies for tsvector columns.",
    });
    await setSearchVector("c", {
      title: "Привет мир",
      tags: ["meta"],
      body: "Кириллица и поиск без стемминга.",
    });
  }, 180_000);

  afterAll(async () => {
    await container.stop();
  });

  it("ranks title matches above body matches", async () => {
    const hits = await searchPostsMeta("astro");
    expect(hits[0]?.slug).toBe("a");
  });

  it("matches Russian without stemming", async () => {
    const hits = await searchPostsMeta("кириллица");
    expect(hits.map((h) => h.slug)).toContain("c");
  });

  it("is accent-insensitive", async () => {
    const hits = await searchPostsMeta("Привет");
    expect(hits.map((h) => h.slug)).toContain("c");
  });

  it("returns [] for empty query", async () => {
    const hits = await searchPostsMeta("   ");
    expect(hits).toEqual([]);
  });
});
