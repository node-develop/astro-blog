import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { APIContext } from "astro";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));

/**
 * The LLM boundary. The fake "translates" by replacing every Cyrillic letter with `e`: the length
 * is preserved, so limits hold, while anything it was not asked to protect visibly changes.
 */
const fake = vi.hoisted(() => ({
  calls: 0,
  mode: "echo" as "echo" | "overlong",
  /** Runs inside the first prose request, i.e. while the model "is thinking". */
  duringProse: undefined as undefined | (() => Promise<void>),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: {
        create: async (body: { system: { text: string }[]; messages: { content: string }[] }) => {
          fake.calls += 1;
          const english = (text: string) => text.replace(/[А-Яа-яЁё]/g, "e");
          const content = JSON.parse(body.messages[0]!.content) as unknown;
          const reply = (value: unknown) => ({
            content: [{ type: "text", text: JSON.stringify(value) }],
          });
          if (Array.isArray(content)) {
            const hook = fake.duringProse;
            fake.duringProse = undefined;
            await hook?.();
            return reply(
              (content as { id: number; text: string }[]).map((p) => ({
                id: p.id,
                text: english(p.text),
              })),
            );
          }
          const { strings } = content as { strings: Record<string, string> };
          return reply(
            Object.fromEntries(
              Object.entries(strings).map(([key, value]) => [
                key,
                fake.mode === "overlong" && key === "title" ? "x".repeat(500) : english(value),
              ]),
            ),
          );
        },
      },
    };
  }),
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { articleBySlugSchema, articleDocumentSchema } from "../../src/lib/content-api/contract";

const token = `artka_${"t".repeat(43)}`;
const ASSET_ID = "6f1c7a52-98f0-4c3e-8f5e-3f3d6a1b2c4d";
const CODE = 'const привет = "мир"; // комментарий остаётся как есть';
const MATH_BLOCK = "\\int_0^1 x\\,dx = \\frac{1}{2}";
const MERMAID = "flowchart LR\n  A --> B";
const body = [
  "## Введение",
  "",
  "Это **важный** абзац с формулой $E = mc^2$ и ещё $$a+b$$ внутри строки.",
  "",
  `![Схема](asset:${ASSET_ID})`,
  "",
  "```ts",
  CODE,
  "```",
  "",
  "$$",
  MATH_BLOCK,
  "$$",
  "",
  "```mermaid",
  MERMAID,
  "```",
  "",
  "Заключение со [ссылкой](https://example.com/doc).",
].join("\n");
const ru = {
  lang: "ru",
  slug: "translate-me",
  title: "Тестовая статья про перевод",
  description: "Описание статьи для проверки перевода через API, достаточно длинное.",
  summary:
    "Краткое содержание статьи, которое проверяет перевод и должно быть не короче шестидесяти символов.",
  body,
  tags: ["ai"],
  keywords: ["перевод", "статьи"],
  sources: [{ url: "https://example.com/source", title: "Источник" }],
  faq: [{ question: "Что это такое?", answer: "Это ответ на вопрос, который достаточно длинный." }],
  relatedSlugs: ["no-en-twin"],
  seo: { title: "Заголовок для SEO", description: "Описание для поисковых систем на русском." },
  provenance: { agent: "integration" },
};
let counter = 0;
const call = async (method: string, path: string, payload?: unknown, key?: string) => {
  counter += 1;
  const response = await ALL({
    params: { path },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": key ?? `key-${counter}`,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }),
    locals: undefined,
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};

describe("article translation with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;
  let ruId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
  }, 180_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await client?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await client`truncate content_api_requests, content_publications, content_articles, content_assets, content_api_keys cascade`;
    const [key] = await state
      .db!.insert(schema.contentApiKeys)
      .values({
        name: "translator-test",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        scopes: ["articles:read", "articles:write"],
      })
      .returning();
    keyId = key!.id;
    await state.db!.insert(schema.contentAssets).values({
      id: ASSET_ID,
      hash: "h".repeat(64),
      url: "https://cdn.example.com/a.png",
      objectKey: "articles/a.png",
      mimeType: "image/png",
      width: 800,
      height: 600,
      byteSize: 1000,
      keyId,
    });
    // A published RU article that the RU document links to and that has no EN twin.
    await state.db!.insert(schema.contentArticles).values({
      externalId: "no-en-twin",
      slug: "no-en-twin",
      lang: "ru",
      publishedVersion: 1,
      document: { lang: "ru", slug: "no-en-twin" } as never,
      keyId,
    });
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests");
    fake.calls = 0;
    fake.mode = "echo";
    fake.duringProse = undefined;
    const created = await call("POST", "articles", { article: ru });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ruId = created.body.id;
  });

  const translate = (force?: boolean, key?: string) =>
    call(
      "POST",
      `articles/${ruId}/translate`,
      { targetLang: "en", ...(force === undefined ? {} : { force }) },
      key,
    );
  const englishRows = () =>
    state.db!.select().from(schema.contentArticles).where(eq(schema.contentArticles.lang, "en"));

  it("keeps code, math, mermaid and assets, drops unpublished related slugs, records the author", async () => {
    const result = await translate();
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const en = articleDocumentSchema.parse(result.body.article);
    expect(en).toMatchObject({
      lang: "en",
      slug: ru.slug,
      externalId: ru.slug,
      relatedSlugs: [],
      tags: ru.tags,
      sources: ru.sources,
      provenance: { agent: "integration", model: "claude-sonnet-5" },
    });
    // Everything prose was translated (the fake leaves no Cyrillic) ...
    const outsideCode = en.body.replace(CODE, "");
    expect(outsideCode).not.toMatch(/[А-Яа-яЁё]/);
    expect(en.title).not.toMatch(/[А-Яа-яЁё]/);
    // ... while frozen content is byte-identical.
    expect(en.body).toContain("```ts\n" + CODE + "\n```");
    expect(en.body).toContain("$$\n" + MATH_BLOCK + "\n$$");
    expect(en.body).toContain("```mermaid\n" + MERMAID + "\n```");
    expect(en.body).toContain("$E = mc^2$");
    expect(en.body).toContain("$$a+b$$");
    expect(en.body).toContain(`](asset:${ASSET_ID})`);
    expect(result.body.warnings).toContain("related_not_translated:no-en-twin");
    expect(result.body.translation).toEqual({ sourceVersion: 1, stale: false });

    const [row] = await englishRows();
    expect(row).toMatchObject({ sourceVersion: 1, manuallyEdited: false, publishedVersion: null });
    const versions = await state
      .db!.select()
      .from(schema.contentArticleVersions)
      .where(eq(schema.contentArticleVersions.articleId, row!.id));
    expect(versions).toEqual([expect.objectContaining({ version: 1, actorKeyId: keyId })]);
  });

  it("is stale after the RU article changes and current again after a re-translation", async () => {
    await translate();
    const by = async () =>
      articleBySlugSchema.parse((await call("GET", `articles/by-slug/${ru.slug}`)).body);
    expect((await by()).translation).toEqual({ sourceVersion: 1, stale: false });

    // Nothing changed: no model call, nothing written.
    const callsBefore = fake.calls;
    const again = await translate();
    expect(again.body.unchanged).toBe(true);
    expect(fake.calls).toBe(callsBefore);

    const edited = await call("PUT", `articles/${ruId}`, {
      article: { ...ru, title: "Исправленная тестовая статья" },
      expectedVersion: 1,
    });
    expect(edited.status).toBe(200);
    expect((await by()).translation).toEqual({ sourceVersion: 1, stale: true });

    const retranslated = await translate();
    expect(retranslated.status).toBe(200);
    expect(fake.calls).toBeGreaterThan(callsBefore);
    expect((await by()).translation).toEqual({ sourceVersion: 2, stale: false });
    expect(retranslated.body.version).toBe(2);
  });

  it("protects an EN article that was not produced by translation, until force", async () => {
    const written = await call("POST", "articles", {
      article: { ...ru, lang: "en", title: "Hand written title", relatedSlugs: [], seo: undefined },
    });
    expect(written.status, JSON.stringify(written.body)).toBe(201);
    const [created] = await englishRows();
    expect(created).toMatchObject({ manuallyEdited: true, sourceVersion: null });

    const refused = await translate();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("translation_protected");
    expect(fake.calls).toBe(0);

    // A row from before the flag existed: not marked, but never produced by translation.
    await state.db!.update(schema.contentArticles).set({ manuallyEdited: false });
    expect((await translate()).body.error.code).toBe("translation_protected");

    const forced = await translate(true);
    expect(forced.status, JSON.stringify(forced.body)).toBe(200);
    expect(fake.calls).toBeGreaterThan(0);
    const [after] = await englishRows();
    expect(after).toMatchObject({ manuallyEdited: false, sourceVersion: 1, version: 2 });

    // A person edits the translation: it is protected again.
    const edited = await call("PUT", `articles/${after!.id}`, {
      article: { ...forced.body.article, title: "Edited by a person" },
      expectedVersion: 2,
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await translate()).body.error.code).toBe("translation_protected");
  });

  it("treats a restored EN version as a person's work: protected and stale", async () => {
    await translate();
    // A forced re-translation leaves a machine-written row (manuallyEdited false) at version 2.
    expect((await translate(true)).status).toBe(200);
    const [machine] = await englishRows();
    expect(machine).toMatchObject({ manuallyEdited: false, sourceVersion: 1, version: 2 });

    const restored = await call("POST", `articles/${machine!.id}/versions/1/restore`, {
      expectedVersion: 2,
    });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    const [row] = await englishRows();
    expect(row).toMatchObject({ manuallyEdited: true, sourceVersion: null, version: 3 });

    const by = articleBySlugSchema.parse((await call("GET", `articles/by-slug/${ru.slug}`)).body);
    expect(by.translation).toEqual({ sourceVersion: null, stale: true });

    const callsBefore = fake.calls;
    const refused = await translate();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("translation_protected");
    expect(fake.calls).toBe(callsBefore);
  });

  it("does not pay twice for a retry with the same Idempotency-Key", async () => {
    const first = await translate(undefined, "same-key");
    const callsAfterFirst = fake.calls;
    expect(first.status).toBe(201);
    const second = await translate(undefined, "same-key");
    expect(fake.calls).toBe(callsAfterFirst);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.body.unchanged).toBeUndefined();
  });

  it("writes nothing when the RU article changes while the model is working", async () => {
    fake.duringProse = async () => {
      const edited = await call("PUT", `articles/${ruId}`, {
        article: { ...ru, title: "Статья изменилась во время перевода" },
        expectedVersion: 1,
      });
      expect(edited.status).toBe(200);
    };
    const result = await translate();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("version_conflict");
    expect(await englishRows()).toHaveLength(0);
  });

  it("fails loud and saves nothing when limits are still broken after the retry", async () => {
    fake.mode = "overlong";
    const result = await translate();
    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe("translation_invalid");
    expect(result.body.error.details.issues).toEqual([expect.objectContaining({ path: "title" })]);
    expect(await englishRows()).toHaveLength(0);
  });

  it("answers 503 when the Anthropic key is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await translate();
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("translation_not_configured");
    expect(fake.calls).toBe(0);
    expect(await englishRows()).toHaveLength(0);
  });
});
