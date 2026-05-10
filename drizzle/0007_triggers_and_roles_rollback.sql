-- Rollback for 0007. Apply manually if needed.

DROP TRIGGER IF EXISTS posts_search_vector_tg ON posts;
DROP TRIGGER IF EXISTS posts_updated_at_tg ON posts;
DROP TRIGGER IF EXISTS agent_jobs_notify_pending_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_jobs_updated_at_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_jobs_emit_event_tg ON agent_jobs;
DROP TRIGGER IF EXISTS agent_runs_emit_event_tg ON agent_runs;

DROP FUNCTION IF EXISTS posts_update_search_vector();
DROP FUNCTION IF EXISTS posts_bump_updated_at();
DROP FUNCTION IF EXISTS agent_jobs_notify_pending();
DROP FUNCTION IF EXISTS agent_jobs_bump_updated_at();
DROP FUNCTION IF EXISTS agent_jobs_emit_event();
DROP FUNCTION IF EXISTS agent_runs_emit_event();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_writer, app_reader, render_reader, agent_writer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_writer, agent_writer;
REVOKE ALL ON SCHEMA public FROM app_writer, app_reader, render_reader, agent_writer;
REVOKE ALL ON SCHEMA langgraph FROM agent_writer;

DROP SCHEMA IF EXISTS langgraph CASCADE;

DROP ROLE IF EXISTS app_writer;
DROP ROLE IF EXISTS app_reader;
DROP ROLE IF EXISTS render_reader;
DROP ROLE IF EXISTS agent_writer;
