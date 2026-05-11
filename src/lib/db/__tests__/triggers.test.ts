import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://blog:blog@localhost:5432/blog";

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
let testUserId: string;

beforeAll(async () => {
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (id, email, name, email_verified, role)
    VALUES (gen_random_uuid(), 'triggers-test@artka.dev', 'triggers-test', false, 'admin')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  testUserId = user!.id;
});

afterAll(async () => {
  await sql`DELETE FROM agent_artifacts WHERE 1=1`;
  await sql`DELETE FROM agent_runs WHERE 1=1`;
  await sql`DELETE FROM agent_jobs WHERE created_by_id = ${testUserId}`;
  await sql`DELETE FROM agent_events WHERE 1=1`;
  await sql`DELETE FROM users WHERE email = 'triggers-test@artka.dev'`;
  await sql.end();
});

describe("agent_jobs triggers", () => {
  it("INSERT pending → pg_notify on agent_jobs_pending channel", async () => {
    const listenSql = postgres(DATABASE_URL, { max: 1 });
    const received: { id: string; kind: string }[] = [];
    await listenSql.listen("agent_jobs_pending", (payload) => {
      received.push(JSON.parse(payload));
    });

    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_kind', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await new Promise((r) => setTimeout(r, 200));
    await listenSql.end();

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe(job!.id);
    expect(received[0]?.kind).toBe("test_kind");
  });

  it("INSERT into agent_jobs creates job.created event", async () => {
    const before = Number(
      (
        await sql<{ count: string }[]>`
        SELECT count(*) AS count FROM agent_events WHERE type = 'job.created'
      `
      )[0]!.count,
    );

    await sql`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_event_emit', '{}'::jsonb, ${testUserId})
    `;

    const after = Number(
      (
        await sql<{ count: string }[]>`
        SELECT count(*) AS count FROM agent_events WHERE type = 'job.created'
      `
      )[0]!.count,
    );

    expect(after - before).toBe(1);
  });

  it("UPDATE agent_jobs status → job.updated event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_update', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await sql`
      UPDATE agent_jobs SET status = 'running' WHERE id = ${job!.id}
    `;

    const events = await sql<{ type: string }[]>`
      SELECT type FROM agent_events WHERE job_id = ${job!.id} ORDER BY id
    `;
    expect(events.map((e) => e.type)).toEqual(["job.created", "job.updated"]);
  });
});

describe("agent_runs triggers", () => {
  it("INSERT agent_run → run.started event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_run', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;

    await sql`
      INSERT INTO agent_runs (job_id, attempt, status)
      VALUES (${job!.id}, 1, 'running')
    `;

    const [evt] = await sql<{ type: string }[]>`
      SELECT type FROM agent_events
      WHERE job_id = ${job!.id} AND type = 'run.started'
      LIMIT 1
    `;
    expect(evt?.type).toBe("run.started");
  });

  it("UPDATE agent_run tokens → run.tokens event", async () => {
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO agent_jobs (kind, payload, created_by_id)
      VALUES ('test_tokens', '{}'::jsonb, ${testUserId})
      RETURNING id
    `;
    const [run] = await sql<{ id: string }[]>`
      INSERT INTO agent_runs (job_id, attempt, status)
      VALUES (${job!.id}, 1, 'running')
      RETURNING id
    `;

    await sql`
      UPDATE agent_runs SET input_tokens = 100, output_tokens = 50 WHERE id = ${run!.id}
    `;

    const [evt] = await sql<{ payload: { input_tokens: number; output_tokens: number } }[]>`
      SELECT payload FROM agent_events
      WHERE run_id = ${run!.id} AND type = 'run.tokens'
      LIMIT 1
    `;
    expect(evt?.payload.input_tokens).toBe(100);
    expect(evt?.payload.output_tokens).toBe(50);
  });
});

describe("posts triggers", () => {
  it("INSERT posts → search_vector populated", async () => {
    const [post] = await sql<{ search_vector: string | null }[]>`
      INSERT INTO posts (slug, lang, title, description, body_md, pub_date)
      VALUES ('test-trigger', 'ru', 'Test Title Karpathy', 'Some Description', 'Body text here', now())
      RETURNING search_vector::text
    `;
    expect(post?.search_vector).toBeTruthy();
    expect(post?.search_vector).toContain("karpathy");

    await sql`DELETE FROM posts WHERE slug = 'test-trigger' AND lang = 'ru'`;
  });

  it("UPDATE posts → updated_at bumps", async () => {
    const [created] = await sql<{ id: string; updated_at: Date }[]>`
      INSERT INTO posts (slug, lang, title, description, body_md, pub_date)
      VALUES ('test-bump', 'ru', 't', 'd', 'b', now())
      RETURNING id, updated_at
    `;

    await new Promise((r) => setTimeout(r, 50));

    const [updated] = await sql<{ updated_at: Date }[]>`
      UPDATE posts SET title = 'changed' WHERE id = ${created!.id}
      RETURNING updated_at
    `;

    expect(updated!.updated_at.getTime()).toBeGreaterThan(created!.updated_at.getTime());
    await sql`DELETE FROM posts WHERE id = ${created!.id}`;
  });
});
