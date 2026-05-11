-- Triggers and Postgres roles for refactor v2.
-- Idempotent where possible (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS).

-- ── 1. search_vector update on posts ──────────────────────────────────

CREATE OR REPLACE FUNCTION posts_update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_md, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(NEW.tags, ' ')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_search_vector_tg ON posts;
CREATE TRIGGER posts_search_vector_tg
BEFORE INSERT OR UPDATE OF title, description, summary, body_md, tags
ON posts FOR EACH ROW EXECUTE FUNCTION posts_update_search_vector();

-- ── 2. updated_at autobump on posts ───────────────────────────────────

CREATE OR REPLACE FUNCTION posts_bump_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_updated_at_tg ON posts;
CREATE TRIGGER posts_updated_at_tg
BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION posts_bump_updated_at();

-- ── 3. agent_jobs pg_notify on pending insert/update ──────────────────

CREATE OR REPLACE FUNCTION agent_jobs_notify_pending() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM pg_notify(
      'agent_jobs_pending',
      json_build_object('id', NEW.id, 'kind', NEW.kind)::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_notify_pending_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_notify_pending_tg
AFTER INSERT OR UPDATE OF status, run_after ON agent_jobs
FOR EACH ROW EXECUTE FUNCTION agent_jobs_notify_pending();

-- ── 4. agent_jobs updated_at autobump ─────────────────────────────────

CREATE OR REPLACE FUNCTION agent_jobs_bump_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_updated_at_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_updated_at_tg
BEFORE UPDATE ON agent_jobs FOR EACH ROW EXECUTE FUNCTION agent_jobs_bump_updated_at();

-- ── 5. agent_events emitter — fan-in для SSE ──────────────────────────

CREATE OR REPLACE FUNCTION agent_jobs_emit_event() RETURNS trigger AS $$
DECLARE
  evt_type text;
  evt_payload jsonb;
  new_event_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt_type := 'job.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.attempts IS DISTINCT FROM OLD.attempts
        OR NEW.last_error IS DISTINCT FROM OLD.last_error THEN
    evt_type := 'job.updated';
  ELSE
    RETURN NEW;
  END IF;
  evt_payload := jsonb_build_object(
    'id', NEW.id,
    'kind', NEW.kind,
    'status', NEW.status,
    'attempts', NEW.attempts,
    'last_error', NEW.last_error,
    'finished_at', NEW.finished_at
  );
  INSERT INTO agent_events (type, job_id, payload)
    VALUES (evt_type, NEW.id, evt_payload)
    RETURNING id INTO new_event_id;
  PERFORM pg_notify(
    'agent_event',
    json_build_object('event_id', new_event_id, 'type', evt_type, 'job_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_jobs_emit_event_tg ON agent_jobs;
CREATE TRIGGER agent_jobs_emit_event_tg
AFTER INSERT OR UPDATE ON agent_jobs
FOR EACH ROW EXECUTE FUNCTION agent_jobs_emit_event();

CREATE OR REPLACE FUNCTION agent_runs_emit_event() RETURNS trigger AS $$
DECLARE
  evt_type text;
  evt_payload jsonb;
  new_event_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt_type := 'run.started';
  ELSIF NEW.status = 'completed' AND OLD.status = 'running' THEN
    evt_type := 'run.finished';
  ELSIF NEW.status = 'failed' AND OLD.status = 'running' THEN
    evt_type := 'run.finished';
  ELSIF NEW.input_tokens IS DISTINCT FROM OLD.input_tokens
        OR NEW.output_tokens IS DISTINCT FROM OLD.output_tokens THEN
    evt_type := 'run.tokens';
  ELSE
    RETURN NEW;
  END IF;
  evt_payload := jsonb_build_object(
    'id', NEW.id,
    'job_id', NEW.job_id,
    'status', NEW.status,
    'input_tokens', NEW.input_tokens,
    'output_tokens', NEW.output_tokens,
    'cost_usd', NEW.cost_usd,
    'finished_at', NEW.finished_at
  );
  INSERT INTO agent_events (type, job_id, run_id, payload)
    VALUES (evt_type, NEW.job_id, NEW.id, evt_payload)
    RETURNING id INTO new_event_id;
  PERFORM pg_notify(
    'agent_event',
    json_build_object('event_id', new_event_id, 'type', evt_type, 'job_id', NEW.job_id, 'run_id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_runs_emit_event_tg ON agent_runs;
CREATE TRIGGER agent_runs_emit_event_tg
AFTER INSERT OR UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION agent_runs_emit_event();

-- ── 6. agent_events retention — keep last 30 days ─────────────────────
-- Cleanup runs in agent worker as a separate job; не делаем триггер на DELETE.

-- ── 7. langgraph schema (для LangGraph checkpointer) ──────────────────

CREATE SCHEMA IF NOT EXISTS langgraph;

-- ── 8. Postgres role separation ───────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer LOGIN PASSWORD 'app_writer_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_reader') THEN
    CREATE ROLE app_reader LOGIN PASSWORD 'app_reader_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'render_reader') THEN
    CREATE ROLE render_reader LOGIN PASSWORD 'render_reader_pw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_writer') THEN
    CREATE ROLE agent_writer LOGIN PASSWORD 'agent_writer_pw';
  END IF;
END $$;

-- app_writer: full access to public schema (Hono API)
GRANT USAGE ON SCHEMA public TO app_writer;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_writer;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_writer;

-- app_reader: read-only public schema (Astro frontend)
GRANT USAGE ON SCHEMA public TO app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_reader;

-- render_reader: read posts + media_assets (Plan 2 cover image lookups)
GRANT USAGE ON SCHEMA public TO render_reader;
GRANT SELECT ON posts TO render_reader;
GRANT SELECT ON media_assets TO render_reader;

-- agent_writer: agent_* tables full + posts write + media_assets read + langgraph schema full
GRANT USAGE ON SCHEMA public TO agent_writer;
GRANT SELECT, INSERT, UPDATE ON posts TO agent_writer;
GRANT SELECT ON media_assets TO agent_writer;
GRANT ALL ON agent_jobs, agent_runs, agent_artifacts, agent_events TO agent_writer;
-- UPDATE on sequences is required for nextval() — direct INSERTs into
-- agent_events from agent_writer would otherwise fail with permission denied.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO agent_writer;
GRANT USAGE, CREATE ON SCHEMA langgraph TO agent_writer;
GRANT ALL ON ALL TABLES IN SCHEMA langgraph TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph GRANT ALL ON TABLES TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA langgraph GRANT ALL ON SEQUENCES TO agent_writer;

-- Explicit denies (NOT-grant): agent_writer не может читать sessions/accounts/verifications
REVOKE ALL ON sessions, accounts, verifications, users FROM agent_writer;
GRANT SELECT (id, email, name) ON users TO agent_writer; -- только для FK lookup
