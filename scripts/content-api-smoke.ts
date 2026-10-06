// Builds a temporary snapshot (the fixture plus one RU and one EN smoke article) and exercises the
// real compiled server. All DB writes target a disposable PostgreSQL container. No GitHub/S3 writes.
// Nothing is written under src/content.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { articleDocumentSchema } from "../src/lib/content-api/contract";
import { exportSchema, type ExportArticle } from "../src/lib/content-api/contract";
import { serializeArticle } from "../src/lib/content-api/markdown";
import {
  snapshotIdOf,
  sortedManifest,
  type ManifestEntry,
} from "../src/lib/content-api/snapshot-id";
import {
  checkSnapshot,
  FIXTURE_SNAPSHOT,
  readJson,
  readManifest,
} from "../src/lib/content/snapshot";
import { verifyContentBuild } from "../src/lib/content/verify-build";

const slug = `api-smoke-${Date.now()}`;
const marker = randomUUID();
const markerEn = randomUUID();
const workerSecret = randomBytes(48).toString("base64url");
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
const assets = [
  { id: marker, url: "https://cdn.example.test/smoke.webp", width: 800, height: 600 },
];
const now = new Date();
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const smokeArticle = async (lang: "ru" | "en", revision: string): Promise<ExportArticle> => {
  const content = await serializeArticle({ ...document, lang }, assets, revision, now);
  return {
    slug,
    lang,
    revision,
    content,
    contentSha256: sha256(content),
    meta: { order: 0, pinned: false, hiddenFromList: false },
  };
};
// The fixture snapshot stays untouched: the smoke snapshot is a copy of it plus the two articles.
const buildSnapshot = async () => {
  const { minArticles } = await readManifest(process.cwd());
  const fixturePath = resolve(process.cwd(), FIXTURE_SNAPSHOT);
  const base = checkSnapshot(await readJson(fixturePath), minArticles, fixturePath);
  const articles = [
    ...base.articles,
    await smokeArticle("ru", marker),
    await smokeArticle("en", markerEn),
  ];
  const manifest: readonly ManifestEntry[] = articles.map(({ slug, lang, revision, meta }) => ({
    slug,
    lang,
    revision,
    ...meta,
  }));
  const byKey = new Map(articles.map((article) => [`${article.lang}/${article.slug}`, article]));
  return exportSchema.parse({
    snapshotId: snapshotIdOf(manifest),
    generatedAt: now.toISOString(),
    count: articles.length,
    articles: sortedManifest(manifest).map((entry) => byKey.get(`${entry.lang}/${entry.slug}`)!),
  });
};
let child: ChildProcess | undefined;
let container: StartedPostgreSqlContainer | undefined;
let client: ReturnType<typeof postgres> | undefined;
let tempDir: string | undefined;
let snapshotWritten = false;
// An empty CONTENT_SNAPSHOT throws in the loader: unset it for the default (fixture) build.
const build = async (snapshotPath?: string, logName = "astro-content-smoke-build.log") => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: "",
    GITHUB_PAT: "",
    CONTENT_WORKER_SECRET: "",
  };
  if (snapshotPath) env.CONTENT_SNAPSHOT = snapshotPath;
  else delete env.CONTENT_SNAPSHOT;
  const output = execFileSync("pnpm", ["build"], { env, maxBuffer: 16 * 1024 * 1024 });
  await writeFile(join(tmpdir(), logName), output);
};
try {
  tempDir = await mkdtemp(join(tmpdir(), "astro-content-smoke-"));
  const smokeSnapshot = await buildSnapshot();
  const snapshotPath = join(tempDir, "snapshot.json");
  await writeFile(snapshotPath, `${JSON.stringify(smokeSnapshot, null, 2)}\n`);
  snapshotWritten = true;
  await build(snapshotPath);
  assert.deepEqual(await verifyContentBuild(smokeSnapshot, "dist/client"), []);
  const html = await readFile(`dist/client/blog/${slug}/index.html`, "utf8");
  assert(html.includes(`data-content-revision="${marker}"`));
  assert(html.includes("Smoke SEO title | artka.dev"));
  assert(html.includes(document.title));
  assert(html.includes(document.seo!.description!));
  assert(html.includes("https://cdn.example.test/smoke.webp"));
  assert(html.includes("Smoke cover caption"));
  assert(html.includes('property="og:image:width" content="800"'));
  assert(html.includes('hreflang="en"'));
  assert(html.includes('"BlogPosting"'));
  assert(html.includes('"FAQPage"'));
  assert(!html.includes("asset:"));
  const sitemap = await readFile("dist/client/sitemap-ru.xml", "utf8");
  assert(sitemap.includes(`/blog/${slug}/`));
  const rss = await readFile("dist/client/rss.xml", "utf8");
  assert(rss.includes(slug));

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
      CONTENT_WORKER_SECRET: workerSecret,
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
  const specResponse = await fetch(`${base}/api/v1/openapi.json`);
  assert.equal(specResponse.status, 200);
  assert.equal((await specResponse.json()).openapi, "3.1.0");
  const workerResponse = await fetch(`${base}/api/v1/_worker/`, {
    method: "POST",
    headers: { authorization: `Bearer ${workerSecret}`, "content-type": "application/json" },
  });
  assert.equal(workerResponse.status, 200, await workerResponse.clone().text());
  assert.deepEqual(await workerResponse.json(), { worked: false });
  // The healthcheck route must see the tick recorded by the worker route: both
  // have to share one heartbeat module instance in the built bundle.
  const version = (await (await fetch(`${base}/api/version`)).json()) as {
    worker: { status: string; lastTickAt: string | null };
  };
  assert.equal(version.worker.status, "ok");
  assert.notEqual(version.worker.lastTickAt, null, "worker tick did not reach /api/version");
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
  const first = await fetch(`${base}/api/v1/articles/`, request);
  assert.equal(first.status, 201, await first.clone().text());
  const saved = await first.json();
  assert.equal(first.headers.get("location"), `/api/v1/articles/${saved.id}/`);
  const second = await fetch(`${base}/api/v1/articles/`, request);
  assert.equal((await second.json()).id, saved.id);
  assert.equal((await fetch(`${base}/api/v1/articles/${saved.id}/`)).status, 401);
  const read = await fetch(`${base}/api/v1/articles/${saved.id}/`, {
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
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  // Leave the normal build in dist, not a build containing the smoke articles.
  if (snapshotWritten) {
    try {
      await build(undefined, "astro-content-smoke-restore-build.log");
    } catch (error) {
      // Do not replace the original failure with the rebuild's.
      process.stderr.write(`Smoke: restoring the fixture build failed: ${String(error)}\n`);
    }
  }
}
