// Builds temporary RU/EN/draft fixtures and exercises the real compiled server.
// All DB writes target a disposable PostgreSQL container. No GitHub/S3 writes.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { articleDocumentSchema } from "../src/lib/content-api/contract";
import { serializeArticle } from "../src/lib/content-api/markdown";

const slug = `api-smoke-${Date.now()}`;
const marker = randomUUID();
const token = `artka_${randomBytes(32).toString("base64url")}`;
const input = JSON.parse(await readFile("docs/api/article.example.json", "utf8"));
const document = articleDocumentSchema.parse({
  ...input.article,
  slug,
  externalId: slug,
  seo: {
    title: "Smoke SEO title",
    description: "Smoke search description for the complete publication test.",
  },
  cover: { assetId: marker, alt: "Smoke cover alt", caption: "Smoke cover caption" },
  body:
    "## Smoke heading\n\nAn example with $x^2$ and **formatting**.\n\n![Inline image](asset:" +
    marker +
    ")",
  faq: [
    {
      question: "Does the API preserve SEO?",
      answer: "Yes, the rendered page uses the supplied metadata and visible content.",
    },
  ],
});
const fixture = serializeArticle(
  document,
  [{ id: marker, url: "https://cdn.example.test/smoke.webp", width: 800, height: 600 }],
  marker,
  new Date(),
);
const created: string[] = [];
let child: ChildProcess | undefined;
let container: StartedPostgreSqlContainer | undefined;
let client: ReturnType<typeof postgres> | undefined;
const build = () => {
  const output = execFileSync("pnpm", ["build"], {
    env: { ...process.env, DATABASE_URL: "", GITHUB_PAT: "", CONTENT_WORKER_SECRET: "" },
    maxBuffer: 16 * 1024 * 1024,
  });
  return writeFile("/tmp/astro-content-smoke-build.log", output);
};
try {
  for (const [path, content] of [
    [`src/content/posts/${slug}.md`, fixture],
    [`src/content/posts/en/${slug}.md`, fixture.replace("lang: ru", "lang: en")],
    [`src/content/posts/${slug}-draft.md`, fixture.replace("draft: false", "draft: true")],
  ]) {
    await writeFile(path!, content!, { flag: "wx" });
    created.push(path!);
  }
  await build();
  const html = await readFile(`dist/client/blog/${slug}/index.html`, "utf8");
  assert(html.includes(`data-content-revision="${marker}"`));
  assert(html.includes("Smoke SEO title | artka.dev"));
  assert(html.includes(document.title));
  assert(html.includes(document.seo!.description!));
  assert(html.includes("https://cdn.example.test/smoke.webp"));
  assert(html.includes("Smoke cover caption"));
  assert(html.includes('property="og:image:width" content="800"'));
  assert(html.includes('hreflang="en-US"'));
  assert(html.includes('"BlogPosting"'));
  assert(html.includes('"FAQPage"'));
  assert(!html.includes("asset:"));
  const sitemap = await readFile("dist/client/sitemap-ru.xml", "utf8");
  assert(sitemap.includes(`/blog/${slug}/`));
  assert(!sitemap.includes(`${slug}-draft`));
  const rss = await readFile("dist/client/rss.xml", "utf8");
  assert(rss.includes(slug));
  assert(!rss.includes(`${slug}-draft`));

  container = await new PostgreSqlContainer("postgres:18-bookworm").start();
  client = postgres(container.getConnectionUri(), { onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client`insert into content_api_keys (name, token_hash, scopes) values ('smoke', ${createHash("sha256").update(token).digest("hex")}, '["articles:read","articles:write","articles:publish"]'::jsonb)`;
  const listener = createServer().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  child = spawn(process.execPath, ["dist/server/entry.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: container.getConnectionUri(),
      GITHUB_PAT: "",
      CONTENT_WORKER_SECRET: "",
      HOST: "127.0.0.1",
      PORT: String(port),
      SITE_URL: "https://artka.dev",
      BETTER_AUTH_SECRET: "content-api-smoke-local-only-secret",
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(`${base}/api/version`)).ok;
    } catch {
      /* startup */
    }
    if (ready) break;
    await sleep(100);
  }
  assert(ready, "Built server did not start");
  assert.equal((await fetch(`${base}/blog/${slug}/`)).status, 200);
  assert.equal((await fetch(`${base}/blog/${slug}-draft/`)).status, 404);
  const specResponse = await fetch(`${base}/api/v1/openapi.json`);
  assert.equal(specResponse.status, 200);
  assert.equal((await specResponse.json()).openapi, "3.1.0");
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "smoke-create",
    },
    body: JSON.stringify({
      article: { ...input.article, slug: `${slug}-private`, externalId: `${slug}-private` },
    }),
  };
  const first = await fetch(`${base}/api/v1/articles`, request);
  assert.equal(first.status, 201, await first.clone().text());
  const saved = await first.json();
  const second = await fetch(`${base}/api/v1/articles`, request);
  assert.equal((await second.json()).id, saved.id);
  assert.equal((await fetch(`${base}/api/v1/articles/${saved.id}`)).status, 401);
  const read = await fetch(`${base}/api/v1/articles/${saved.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).article.slug, `${slug}-private`);
  process.stdout.write(
    "Smoke passed: compiled RU/EN article, SEO, images, FAQ, sources, sitemap, RSS, private drafts, HTTP auth and idempotency.\n",
  );
} finally {
  child?.kill("SIGTERM");
  await client?.end();
  await container?.stop();
  for (const path of created) await unlink(path);
  // Leave the normal build in dist, not a build containing test articles.
  if (created.length) await build();
}
