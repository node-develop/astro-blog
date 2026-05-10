# Plan 4 / 6: Python Agent Service + draft_from_url Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реальный Python agent service с worker_loop (FOR UPDATE SKIP LOCKED + LISTEN), reaper_loop (stale claims), scheduler_loop (APScheduler), LangGraph-граф `draft_from_url` end-to-end, LangSmith tracing, schema parity test против Drizzle. Проверка архитектуры на одном агенте.

**Architecture:** Один Python-процесс с `asyncio.gather(worker, reaper, scheduler, health)`. Worker pulls jobs через FOR UPDATE SKIP LOCKED, реагирует на `LISTEN agent_jobs_pending` для sub-second pickup. LangGraph граф состоит из nodes (fetch URL, extract content, LLM-write draft, persist post). Чекпойнты в Postgres schema `langgraph`. LangSmith tracing через env var; trace_id сохраняется в `agent_runs`. Token/cost tracking — UPDATE agent_runs после каждого LLM call. Schema parity test проверяет, что Pydantic-модели соответствуют Drizzle.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, asyncpg, anthropic SDK, langchain-anthropic, langgraph, langgraph-checkpoint-postgres, langsmith, httpx, trafilatura, apscheduler, structlog, pydantic, uv.

**Spec:** `docs/superpowers/specs/2026-05-10-postgres-cms-agents-design.md` (Phase 6).

**Prerequisites:** Plans 1-3 merged. Postgres schema `langgraph` создана (Plan 1). `agent_writer` role с grants на langgraph schema (Plan 1). Admin SPA с job detail + trigger wizard (Plan 3).

---

## File Structure

### New files (под `agents/`)
- `agents/pyproject.toml` (REPLACE — добавляем real deps)
- `agents/src/agents/main.py` (REPLACE)
- `agents/src/agents/config.py` — Pydantic Settings
- `agents/src/agents/db.py` — asyncpg pool + LISTEN
- `agents/src/agents/log.py` — structlog setup
- `agents/src/agents/health.py` — FastAPI /health
- `agents/src/agents/worker/__init__.py`
- `agents/src/agents/worker/claim.py`
- `agents/src/agents/worker/runner.py`
- `agents/src/agents/worker/retry.py`
- `agents/src/agents/worker/reaper.py`
- `agents/src/agents/scheduler.py`
- `agents/src/agents/graphs/__init__.py`
- `agents/src/agents/graphs/_registry.py`
- `agents/src/agents/graphs/draft_from_url.py`
- `agents/src/agents/tools/__init__.py`
- `agents/src/agents/tools/fetch_url.py`
- `agents/src/agents/tools/extract_content.py`
- `agents/src/agents/tools/post_db.py`
- `agents/src/agents/tools/llm.py`
- `agents/src/agents/models.py` — Pydantic-модели для DB rows
- `agents/src/agents/payloads.py` — Pydantic схемы payload per kind
- `agents/tests/conftest.py`
- `agents/tests/test_schema_parity.py`
- `agents/tests/test_claim.py`
- `agents/tests/test_reaper.py`
- `agents/tests/test_idempotency.py`
- `agents/tests/test_draft_from_url.py`
- `agents/Dockerfile` (UPDATE — install deps)

---

## Task 1: pyproject.toml + uv setup

- [ ] **Step 1: Replace `agents/pyproject.toml`**

```toml
[project]
name = "artka-agents"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "anthropic>=0.40",
    "apscheduler>=3.10",
    "asyncpg>=0.30",
    "fastapi>=0.115",
    "httpx>=0.27",
    "langchain>=0.3",
    "langchain-anthropic>=0.3",
    "langgraph>=0.2",
    "langgraph-checkpoint-postgres>=2.0",
    "langsmith>=0.2",
    "psycopg[binary]>=3.2",
    "pydantic>=2.10",
    "pydantic-settings>=2.6",
    "structlog>=24.4",
    "trafilatura>=2.0",
    "uvicorn[standard]>=0.32",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "ruff>=0.8",
    "testcontainers[postgres]>=4.8",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/agents"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py313"
[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "RUF"]
```

- [ ] **Step 2: Install**

```bash
cd /Users/izual/astro-blog/agents
uv venv .venv
source .venv/bin/activate
uv pip install -e ".[dev]"
uv pip list | grep langgraph
```

Expected: langgraph + langgraph-checkpoint-postgres установлены.

- [ ] **Step 3: Commit**

```bash
git add agents/pyproject.toml
git commit -m "chore(agents): real deps (langgraph, asyncpg, anthropic, structlog)"
```

---

## Task 2: Config, logging, DB pool

**Files:**
- Create: `agents/src/agents/config.py`
- Create: `agents/src/agents/log.py`
- Create: `agents/src/agents/db.py`

- [ ] **Step 1: `config.py`**

```python
# agents/src/agents/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    ANTHROPIC_API_KEY: str
    LANGSMITH_API_KEY: str | None = None
    LANGCHAIN_PROJECT: str = "artka-blog"
    LANGGRAPH_PG_SCHEMA: str = "langgraph"

    PORT: int = 8000
    WORKER_NAME: str = "agent-worker-1"

    POLL_TIMEOUT_S: float = 10.0
    REAPER_INTERVAL_S: float = 60.0
    REAPER_STALE_AFTER_S: float = 600.0  # 10 min

    RSS_FEEDS: list[str] = []
    DAILY_DIGEST_HOUR_UTC: int = 8

    LOG_LEVEL: str = "INFO"


settings = Settings()  # type: ignore[call-arg]


def configure_langsmith() -> None:
    """Set env vars for LangChain tracing v2."""
    import os
    if settings.LANGSMITH_API_KEY:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGSMITH_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
```

- [ ] **Step 2: `log.py`**

```python
# agents/src/agents/log.py
import logging
import structlog
from .config import settings


def configure() -> None:
    logging.basicConfig(level=settings.LOG_LEVEL, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.LOG_LEVEL),
        ),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger("agents")
```

- [ ] **Step 3: `db.py`**

```python
# agents/src/agents/db.py
from __future__ import annotations
import asyncpg
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from .config import settings
from .log import logger

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            init=_init_connection,
        )
        logger.info("db.pool_created")
    return _pool


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn
```

- [ ] **Step 4: Smoke connect**

```bash
cd agents
DATABASE_URL=postgresql://agent_writer:agent_writer_pw@localhost:5432/blog \
  ANTHROPIC_API_KEY=sk-test \
  uv run python -c "
import asyncio
from agents.db import get_pool
async def main():
    p = await get_pool()
    async with p.acquire() as c:
        print(await c.fetchval('SELECT version()'))
asyncio.run(main())
"
```

Expected: prints PostgreSQL 18.x version.

- [ ] **Step 5: Commit**

```bash
git add agents/src/agents/config.py agents/src/agents/log.py agents/src/agents/db.py
git commit -m "feat(agents): config (Pydantic Settings), structlog, asyncpg pool"
```

---

## Task 3: Pydantic models matching Drizzle schema

**Files:**
- Create: `agents/src/agents/models.py`
- Create: `agents/src/agents/payloads.py`

- [ ] **Step 1: `models.py`**

```python
# agents/src/agents/models.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, Field


class AgentJob(BaseModel):
    id: UUID
    kind: str
    payload: dict[str, Any]
    status: Literal["pending", "running", "completed", "failed", "cancelled"]
    priority: int
    run_after: datetime
    attempts: int
    max_attempts: int
    last_error: str | None
    idempotency_key: str | None
    created_by_id: UUID | None
    claimed_at: datetime | None
    claimed_by: str | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentRun(BaseModel):
    id: UUID
    job_id: UUID
    attempt: int
    langgraph_thread_id: str | None
    langsmith_trace_id: str | None
    status: Literal["running", "completed", "failed"]
    started_at: datetime
    finished_at: datetime | None
    model_calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    error: dict[str, Any] | None
    final_output: dict[str, Any] | None


class AgentArtifact(BaseModel):
    id: UUID
    run_id: UUID
    kind: str
    ref_table: str | None
    ref_id: str | None
    content: dict[str, Any]
    created_at: datetime


class Post(BaseModel):
    """Subset of posts table that agents need."""
    id: UUID
    slug: str
    lang: Literal["ru", "en"]
    kind: Literal["post", "page", "project"]
    status: Literal["draft", "published", "unlisted", "archived"]
    title: str
    description: str
    summary: str | None
    keywords: list[str]
    tags: list[str]
    cover: str | None
    author: str
    pub_date: datetime
    body_md: str
    body_html: str | None
    source_hash: str | None
    manually_edited: bool


class NewPost(BaseModel):
    slug: str
    lang: Literal["ru", "en"] = "ru"
    kind: Literal["post", "page", "project"] = "post"
    status: Literal["draft", "published", "unlisted", "archived"] = "draft"
    title: str
    description: str
    summary: str | None = None
    keywords: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    cover: str | None = None
    cover_alt: str | None = None
    author: str = "Артём"
    pub_date: datetime
    extra: dict[str, Any] = Field(default_factory=dict)
    body_md: str
    source_hash: str | None = None
```

- [ ] **Step 2: `payloads.py` — per-kind payload models**

```python
# agents/src/agents/payloads.py
from __future__ import annotations
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, HttpUrl


class TranslatePayload(BaseModel):
    post_id: UUID
    force: bool = False


class SocialDraftsPayload(BaseModel):
    post_id: UUID
    channels: list[Literal["x_en", "li_en", "tg_ru"]] | None = None


class DraftFromUrlPayload(BaseModel):
    url: HttpUrl
    target_lang: Literal["ru", "en"] = "ru"


class RssMonitorPayload(BaseModel):
    feeds: list[HttpUrl] | None = None


class DailyDigestPayload(BaseModel):
    since_hours: int = 24


class RerenderAllPayload(BaseModel):
    reason: str


class ExportToGitPayload(BaseModel):
    post_id: UUID


PAYLOAD_CLASSES = {
    "translate": TranslatePayload,
    "social_drafts": SocialDraftsPayload,
    "draft_from_url": DraftFromUrlPayload,
    "rss_monitor": RssMonitorPayload,
    "daily_digest": DailyDigestPayload,
    "rerender_all": RerenderAllPayload,
    "export_to_git": ExportToGitPayload,
}
```

- [ ] **Step 3: Commit**

```bash
git add agents/src/agents/models.py agents/src/agents/payloads.py
git commit -m "feat(agents): Pydantic models for agent_jobs/runs/artifacts/posts"
```

---

## Task 4: Schema parity test (Pydantic ↔ Drizzle)

**Files:**
- Create: `agents/tests/conftest.py`
- Create: `agents/tests/test_schema_parity.py`

- [ ] **Step 1: `conftest.py`**

```python
# agents/tests/conftest.py
import pytest_asyncio
from testcontainers.postgres import PostgresContainer
import asyncio
import subprocess
import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest_asyncio.fixture(scope="session")
async def postgres_url():
    pg = PostgresContainer("postgres:18-bookworm", username="blog", password="blog", dbname="blog")
    pg.start()
    url = pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql://")
    os.environ["DATABASE_URL"] = url

    # Apply Drizzle migrations
    subprocess.run(
        ["pnpm", "--filter=astro-blog", "db:push", "--force"],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": url},
        check=True,
    )

    # Apply manual SQL (0007_triggers_and_roles.sql)
    sql_file = REPO_ROOT / "drizzle" / "0007_triggers_and_roles.sql"
    if sql_file.exists():
        import asyncpg
        conn = await asyncpg.connect(url)
        try:
            await conn.execute(sql_file.read_text())
        finally:
            await conn.close()

    yield url
    pg.stop()


@pytest_asyncio.fixture
async def db_pool(postgres_url):
    import asyncpg
    pool = await asyncpg.create_pool(postgres_url, min_size=1, max_size=5)
    yield pool
    await pool.close()
```

- [ ] **Step 2: `test_schema_parity.py`**

```python
# agents/tests/test_schema_parity.py
import asyncpg
import pytest
from agents.models import AgentJob, AgentRun, AgentArtifact, Post

# Map Pydantic field name → expected Postgres column name (snake_case)
TABLES = {
    "agent_jobs": AgentJob,
    "agent_runs": AgentRun,
    "agent_artifacts": AgentArtifact,
    "posts": Post,
}


@pytest.mark.asyncio
async def test_pydantic_models_match_drizzle_schema(db_pool):
    async with db_pool.acquire() as conn:
        for table, model in TABLES.items():
            cols_in_db = await conn.fetch(
                """
                SELECT column_name, is_nullable, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                """,
                table,
            )
            db_col_names = {row["column_name"] for row in cols_in_db}

            pydantic_fields = set(model.model_fields.keys())
            missing_in_db = pydantic_fields - db_col_names
            assert not missing_in_db, (
                f"{table}: Pydantic fields not in DB: {missing_in_db}"
            )
            # Note: extra DB columns не fail — Pydantic-модель может быть subset (например Post)
```

- [ ] **Step 3: Run**

```bash
cd agents
uv run pytest tests/test_schema_parity.py -v
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add agents/tests/conftest.py agents/tests/test_schema_parity.py
git commit -m "test(agents): schema parity Pydantic ↔ Drizzle (CI guard against drift)"
```

---

## Task 5: Worker — claim, run, retry

**Files:**
- Create: `agents/src/agents/worker/{__init__,claim,runner,retry}.py`

- [ ] **Step 1: `worker/claim.py`**

```python
# agents/src/agents/worker/claim.py
from __future__ import annotations
import asyncpg
from ..models import AgentJob


async def claim_next_job(conn: asyncpg.Connection, claimed_by: str) -> AgentJob | None:
    row = await conn.fetchrow(
        """
        UPDATE agent_jobs
        SET status = 'running',
            claimed_at = now(),
            claimed_by = $1,
            attempts = attempts + 1
        WHERE id = (
            SELECT id FROM agent_jobs
            WHERE status = 'pending' AND run_after <= now()
            ORDER BY priority DESC, run_after, created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
        """,
        claimed_by,
    )
    if row is None:
        return None
    return AgentJob(**dict(row))
```

- [ ] **Step 2: `worker/retry.py`**

```python
# agents/src/agents/worker/retry.py
from __future__ import annotations
import asyncpg
from datetime import datetime, timedelta


async def reschedule(
    conn: asyncpg.Connection,
    job_id,
    attempts: int,
    error: str,
) -> None:
    backoff_s = min(60 * 60, 30 * (2 ** (attempts - 1)))  # 30, 60, 120, ... cap 1h
    await conn.execute(
        """
        UPDATE agent_jobs
        SET status = 'pending',
            run_after = $1,
            last_error = $2,
            claimed_at = NULL,
            claimed_by = NULL
        WHERE id = $3
        """,
        datetime.utcnow() + timedelta(seconds=backoff_s),
        error,
        job_id,
    )


async def mark_failed(
    conn: asyncpg.Connection, job_id, error: str
) -> None:
    await conn.execute(
        """
        UPDATE agent_jobs
        SET status = 'failed',
            last_error = $1,
            finished_at = now()
        WHERE id = $2
        """,
        error,
        job_id,
    )


async def mark_completed(conn: asyncpg.Connection, job_id) -> None:
    await conn.execute(
        """
        UPDATE agent_jobs
        SET status = 'completed',
            finished_at = now()
        WHERE id = $1
        """,
        job_id,
    )
```

- [ ] **Step 3: `worker/runner.py`**

```python
# agents/src/agents/worker/runner.py
from __future__ import annotations
import asyncpg
import json
import traceback
from uuid import UUID, uuid4
from langsmith import Client
from ..config import settings
from ..log import logger
from ..models import AgentJob
from ..graphs._registry import REGISTRY
from .retry import reschedule, mark_failed, mark_completed


async def create_run(
    conn: asyncpg.Connection, job: AgentJob
) -> UUID:
    run_id = uuid4()
    await conn.execute(
        """
        INSERT INTO agent_runs (id, job_id, attempt, status, started_at)
        VALUES ($1, $2, $3, 'running', now())
        """,
        run_id,
        job.id,
        job.attempts,
    )
    return run_id


async def update_run_trace_id(
    conn: asyncpg.Connection, run_id: UUID, trace_id: str | None
) -> None:
    await conn.execute(
        "UPDATE agent_runs SET langsmith_trace_id = $1 WHERE id = $2",
        trace_id,
        run_id,
    )


async def mark_run_completed(
    conn: asyncpg.Connection, run_id: UUID, final: dict
) -> None:
    await conn.execute(
        """
        UPDATE agent_runs
        SET status = 'completed',
            finished_at = now(),
            final_output = $1
        WHERE id = $2
        """,
        json.dumps(final, default=str),
        run_id,
    )


async def mark_run_failed(
    conn: asyncpg.Connection, run_id: UUID, error: BaseException
) -> None:
    payload = {
        "type": type(error).__name__,
        "message": str(error),
        "traceback": traceback.format_exc(),
    }
    await conn.execute(
        """
        UPDATE agent_runs
        SET status = 'failed',
            finished_at = now(),
            error = $1
        WHERE id = $2
        """,
        json.dumps(payload),
        run_id,
    )


async def run_job(pool: asyncpg.Pool, job: AgentJob) -> None:
    log = logger.bind(job_id=str(job.id), kind=job.kind, attempt=job.attempts)
    log.info("worker.run_start")

    if job.kind not in REGISTRY:
        async with pool.acquire() as conn:
            await mark_failed(conn, job.id, f"Unknown kind: {job.kind}")
        log.error("worker.unknown_kind")
        return

    graph_factory = REGISTRY[job.kind]

    async with pool.acquire() as conn:
        run_id = await create_run(conn, job)

    try:
        graph = await graph_factory(pool)
        config = {"configurable": {"thread_id": str(run_id)}}

        # Trace via LangSmith — context-managed
        ls_client = Client() if settings.LANGSMITH_API_KEY else None

        final_state = await graph.ainvoke(
            {"job_id": str(job.id), "run_id": str(run_id), **job.payload},
            config=config,
        )

        # Read trace_id from LangSmith (best-effort)
        trace_id = None
        if ls_client:
            try:
                runs = list(ls_client.list_runs(project_name=settings.LANGCHAIN_PROJECT, limit=5))
                for r in runs:
                    if str(run_id) in (r.extra or {}).get("metadata", {}).values():
                        trace_id = str(r.id)
                        break
            except Exception:
                pass

        async with pool.acquire() as conn:
            if trace_id:
                await update_run_trace_id(conn, run_id, trace_id)
            await mark_run_completed(conn, run_id, final_state if isinstance(final_state, dict) else {})
            await mark_completed(conn, job.id)
        log.info("worker.run_done")

    except Exception as e:
        log.exception("worker.run_failed")
        async with pool.acquire() as conn:
            await mark_run_failed(conn, run_id, e)
            if job.attempts >= job.max_attempts:
                await mark_failed(conn, job.id, str(e))
            else:
                await reschedule(conn, job.id, job.attempts, str(e))
```

- [ ] **Step 4: `worker/__init__.py`**

```python
# agents/src/agents/worker/__init__.py
from __future__ import annotations
import asyncio
import asyncpg
from ..config import settings
from ..db import get_pool
from ..log import logger
from .claim import claim_next_job
from .runner import run_job


async def worker_loop() -> None:
    pool = await get_pool()
    notify_event = asyncio.Event()

    listen_conn = await asyncpg.connect(settings.DATABASE_URL)
    await listen_conn.add_listener(
        "agent_jobs_pending",
        lambda *args: notify_event.set(),
    )
    logger.info("worker.listen_attached")

    try:
        while True:
            async with pool.acquire() as conn:
                job = await claim_next_job(conn, settings.WORKER_NAME)

            if job is None:
                try:
                    await asyncio.wait_for(notify_event.wait(), timeout=settings.POLL_TIMEOUT_S)
                except asyncio.TimeoutError:
                    pass
                notify_event.clear()
                continue

            await run_job(pool, job)
    finally:
        await listen_conn.close()
```

- [ ] **Step 5: Commit**

```bash
git add agents/src/agents/worker/
git commit -m "feat(agents): worker_loop with claim/run/retry + LISTEN agent_jobs_pending"
```

---

## Task 6: Reaper, scheduler, health

**Files:**
- Create: `agents/src/agents/worker/reaper.py`
- Create: `agents/src/agents/scheduler.py`
- Create: `agents/src/agents/health.py`

- [ ] **Step 1: `worker/reaper.py`**

```python
# agents/src/agents/worker/reaper.py
from __future__ import annotations
import asyncio
from datetime import datetime, timedelta
from ..config import settings
from ..db import get_pool
from ..log import logger


async def reaper_loop() -> None:
    pool = await get_pool()
    while True:
        await asyncio.sleep(settings.REAPER_INTERVAL_S)
        try:
            cutoff = datetime.utcnow() - timedelta(seconds=settings.REAPER_STALE_AFTER_S)
            async with pool.acquire() as conn:
                # Stale claims: status='running' AND claimed_at < cutoff
                stale = await conn.fetch(
                    """
                    SELECT id, kind, attempts, max_attempts, claimed_by
                    FROM agent_jobs
                    WHERE status = 'running' AND claimed_at < $1
                    """,
                    cutoff,
                )
                if not stale:
                    continue
                for job in stale:
                    logger.warn(
                        "reaper.stale_claim",
                        job_id=str(job["id"]),
                        kind=job["kind"],
                        claimed_by=job["claimed_by"],
                    )
                    if job["attempts"] >= job["max_attempts"]:
                        await conn.execute(
                            """
                            UPDATE agent_jobs
                            SET status = 'failed',
                                last_error = 'reaped: stale running claim',
                                finished_at = now()
                            WHERE id = $1
                            """,
                            job["id"],
                        )
                    else:
                        await conn.execute(
                            """
                            UPDATE agent_jobs
                            SET status = 'pending',
                                claimed_at = NULL,
                                claimed_by = NULL,
                                run_after = now()
                            WHERE id = $1
                            """,
                            job["id"],
                        )
        except Exception:
            logger.exception("reaper.loop_error")
```

- [ ] **Step 2: `scheduler.py`**

```python
# agents/src/agents/scheduler.py
from __future__ import annotations
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .config import settings
from .db import get_pool
from .log import logger


async def enqueue_job(kind: str, payload: dict) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO agent_jobs (kind, payload, created_by_id)
            VALUES ($1, $2::jsonb, NULL)
            ON CONFLICT DO NOTHING
            """,
            kind,
            payload,
        )
    logger.info("scheduler.enqueued", kind=kind)


async def scheduler_loop() -> None:
    sched = AsyncIOScheduler(timezone="UTC")

    if settings.RSS_FEEDS:
        sched.add_job(
            enqueue_job, "interval", minutes=30,
            args=["rss_monitor", {"feeds": [str(u) for u in settings.RSS_FEEDS]}],
            id="rss_monitor",
            replace_existing=True,
        )

    sched.add_job(
        enqueue_job, "cron",
        hour=settings.DAILY_DIGEST_HOUR_UTC, minute=0,
        args=["daily_digest", {"since_hours": 24}],
        id="daily_digest",
        replace_existing=True,
    )

    sched.start()
    logger.info("scheduler.started", jobs=[j.id for j in sched.get_jobs()])
    while True:
        await asyncio.sleep(3600)
```

- [ ] **Step 3: `health.py`**

```python
# agents/src/agents/health.py
from __future__ import annotations
import asyncio
from datetime import datetime
from fastapi import FastAPI, Response
import uvicorn
from .config import settings
from .db import get_pool


app = FastAPI(title="artka-agents")
_state = {"last_claim_at": None, "started_at": datetime.utcnow().isoformat()}


@app.get("/health")
async def health() -> dict:
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "service": "agents", **_state}
    except Exception as e:
        return Response(content=f'{{"status":"error","error":"{e}"}}', status_code=503, media_type="application/json")


def update_state(key: str, value: object) -> None:
    _state[key] = value


async def run_health_server() -> None:
    config = uvicorn.Config(app, host="0.0.0.0", port=settings.PORT, log_level="warning")
    server = uvicorn.Server(config)
    await server.serve()
```

- [ ] **Step 4: Commit**

```bash
git add agents/src/agents/worker/reaper.py agents/src/agents/scheduler.py agents/src/agents/health.py
git commit -m "feat(agents): reaper, scheduler (APScheduler), FastAPI health"
```

---

## Task 7: LLM client + tools

**Files:**
- Create: `agents/src/agents/tools/__init__.py`
- Create: `agents/src/agents/tools/llm.py`
- Create: `agents/src/agents/tools/fetch_url.py`
- Create: `agents/src/agents/tools/extract_content.py`
- Create: `agents/src/agents/tools/post_db.py`

- [ ] **Step 1: `tools/llm.py`**

```python
# agents/src/agents/tools/llm.py
from __future__ import annotations
from anthropic import AsyncAnthropic
from langsmith import traceable
from ..config import settings


_client: AsyncAnthropic | None = None

# USD per 1M tokens (input, output)
PRICING: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-sonnet-4-6-20250912": (3.0, 15.0),
    "claude-opus-4-7-20250101": (15.0, 75.0),
}


def client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def cost_for(model: str, in_tokens: int, out_tokens: int) -> float:
    rate = PRICING.get(model, (0.0, 0.0))
    return (in_tokens / 1e6) * rate[0] + (out_tokens / 1e6) * rate[1]


@traceable(run_type="llm")
async def complete(
    *,
    system: str,
    prompt: str,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 4096,
    cache: bool = True,
) -> dict:
    msg = await client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[{
            "type": "text",
            "text": system,
            **({"cache_control": {"type": "ephemeral"}} if cache else {}),
        }],
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    return {
        "text": text,
        "input_tokens": msg.usage.input_tokens,
        "output_tokens": msg.usage.output_tokens,
        "model": model,
        "cost_usd": cost_for(model, msg.usage.input_tokens, msg.usage.output_tokens),
    }


async def update_run_usage(
    pool, run_id, in_tokens: int, out_tokens: int, cost: float
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE agent_runs
            SET model_calls = model_calls + 1,
                input_tokens = input_tokens + $1,
                output_tokens = output_tokens + $2,
                cost_usd = cost_usd + $3
            WHERE id = $4
            """,
            in_tokens, out_tokens, cost, run_id,
        )
```

- [ ] **Step 2: `tools/fetch_url.py`**

```python
# agents/src/agents/tools/fetch_url.py
from __future__ import annotations
import httpx


async def fetch_html(url: str, timeout_s: float = 15.0) -> str:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(timeout_s),
        headers={"User-Agent": "artka-agent/0.1 (+https://artka.dev)"},
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text
```

- [ ] **Step 3: `tools/extract_content.py`**

```python
# agents/src/agents/tools/extract_content.py
from __future__ import annotations
import trafilatura


def extract(html: str, url: str) -> dict | None:
    extracted = trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        with_metadata=True,
        include_links=True,
        include_images=False,
    )
    if not extracted:
        return None
    metadata = trafilatura.extract_metadata(html)
    return {
        "title": metadata.title if metadata else None,
        "author": metadata.author if metadata else None,
        "published": metadata.date if metadata else None,
        "url": url,
        "content_md": extracted,
    }
```

- [ ] **Step 4: `tools/post_db.py`**

```python
# agents/src/agents/tools/post_db.py
from __future__ import annotations
import re
from uuid import UUID
from ..db import acquire
from ..models import NewPost


def slugify(text: str, max_len: int = 80) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower(), flags=re.UNICODE)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:max_len] or "untitled"


async def insert_draft_post(post: NewPost) -> UUID:
    async with acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO posts (
                slug, lang, kind, status, title, description, summary,
                keywords, tags, cover, cover_alt, author, pub_date, extra,
                body_md, source_hash, manually_edited
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
            ON CONFLICT (slug, lang) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                body_md = EXCLUDED.body_md,
                source_hash = EXCLUDED.source_hash,
                updated_at = now()
            RETURNING id
            """,
            post.slug, post.lang, post.kind, post.status, post.title,
            post.description, post.summary, post.keywords, post.tags,
            post.cover, post.cover_alt, post.author, post.pub_date, post.extra,
            post.body_md, post.source_hash, False,
        )
        return row["id"]


async def insert_artifact(
    *, run_id: UUID, kind: str, content: dict,
    ref_table: str | None = None, ref_id: str | None = None,
) -> UUID:
    async with acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO agent_artifacts (run_id, kind, ref_table, ref_id, content)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING id
            """,
            run_id, kind, ref_table, ref_id, content,
        )
        return row["id"]
```

- [ ] **Step 5: Commit**

```bash
git add agents/src/agents/tools/
git commit -m "feat(agents): tools (llm with cost tracking, fetch_url, extract, post_db)"
```

---

## Task 8: First LangGraph — `draft_from_url`

**Files:**
- Create: `agents/src/agents/graphs/__init__.py`
- Create: `agents/src/agents/graphs/_registry.py`
- Create: `agents/src/agents/graphs/draft_from_url.py`

- [ ] **Step 1: `graphs/_registry.py`**

```python
# agents/src/agents/graphs/_registry.py
from __future__ import annotations
from collections.abc import Awaitable, Callable
from typing import Any
import asyncpg


GraphFactory = Callable[[asyncpg.Pool], Awaitable[Any]]

# kind → factory(pool) → compiled graph
REGISTRY: dict[str, GraphFactory] = {}


def register(kind: str):
    def decorator(factory: GraphFactory) -> GraphFactory:
        REGISTRY[kind] = factory
        return factory
    return decorator


# Import to register
from . import draft_from_url  # noqa: F401, E402
```

- [ ] **Step 2: `graphs/draft_from_url.py`**

```python
# agents/src/agents/graphs/draft_from_url.py
from __future__ import annotations
from datetime import datetime
from typing import TypedDict
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from ..config import settings
from ..log import logger
from ..models import NewPost
from ..payloads import DraftFromUrlPayload
from ..tools.fetch_url import fetch_html
from ..tools.extract_content import extract
from ..tools.llm import complete, update_run_usage
from ..tools.post_db import slugify, insert_draft_post, insert_artifact
from ._registry import register


SYSTEM_PROMPT = """\
Ты — ассистент-редактор для блога artka.dev. Получив исходный текст,
напиши черновик поста: краткий title, description (1-2 предложения),
summary (150 слов), и body на markdown. Сохрани mermaid/код/ссылки.
Стиль: содержательно, без воды, в первом лице (автор — Артём).
Язык: русский, если target_lang=ru, иначе английский.
Верни строго в формате:

---title---
<title>
---description---
<description>
---summary---
<summary>
---body---
<markdown body>
"""


class DraftFromUrlState(TypedDict, total=False):
    job_id: str
    run_id: str
    url: str
    target_lang: str
    fetched_html: str | None
    extracted: dict | None
    generated: dict | None
    draft_post_id: str | None


def parse_llm_output(text: str) -> dict:
    sections = {}
    current = None
    buf: list[str] = []
    for line in text.split("\n"):
        m = line.strip()
        if m in ("---title---", "---description---", "---summary---", "---body---"):
            if current:
                sections[current] = "\n".join(buf).strip()
            current = m.strip("-")
            buf = []
        else:
            buf.append(line)
    if current:
        sections[current] = "\n".join(buf).strip()
    return sections


@register("draft_from_url")
async def factory(pool):
    g = StateGraph(DraftFromUrlState)

    async def fetch_node(state: DraftFromUrlState) -> dict:
        html = await fetch_html(state["url"])
        return {"fetched_html": html}

    async def extract_node(state: DraftFromUrlState) -> dict:
        e = extract(state["fetched_html"], state["url"])
        if not e:
            raise ValueError(f"Failed to extract content from {state['url']}")
        return {"extracted": e}

    async def write_node(state: DraftFromUrlState) -> dict:
        prompt = (
            f"Source URL: {state['url']}\n"
            f"Target lang: {state['target_lang']}\n\n"
            f"Title (from source): {state['extracted'].get('title')}\n\n"
            f"Content:\n{state['extracted']['content_md']}"
        )
        result = await complete(system=SYSTEM_PROMPT, prompt=prompt)
        await update_run_usage(
            pool, state["run_id"],
            result["input_tokens"], result["output_tokens"], result["cost_usd"],
        )
        sections = parse_llm_output(result["text"])
        return {"generated": sections}

    async def persist_node(state: DraftFromUrlState) -> dict:
        sections = state["generated"] or {}
        title = sections.get("title", state["extracted"].get("title", "Untitled"))[:200]
        post = NewPost(
            slug=slugify(title),
            lang=state["target_lang"],  # type: ignore[arg-type]
            kind="post",
            status="draft",
            title=title,
            description=sections.get("description", "")[:500] or "Draft",
            summary=sections.get("summary", "") or None,
            tags=["agent-draft"],
            pub_date=datetime.utcnow(),
            body_md=sections.get("body", state["extracted"]["content_md"]),
            extra={"source_url": state["url"]},
        )
        post_id = await insert_draft_post(post)
        await insert_artifact(
            run_id=state["run_id"],
            kind="draft_post",
            content={"slug": post.slug, "title": title, "source_url": state["url"]},
            ref_table="posts",
            ref_id=str(post_id),
        )
        return {"draft_post_id": str(post_id)}

    g.add_node("fetch", fetch_node)
    g.add_node("extract", extract_node)
    g.add_node("write", write_node)
    g.add_node("persist", persist_node)
    g.set_entry_point("fetch")
    g.add_edge("fetch", "extract")
    g.add_edge("extract", "write")
    g.add_edge("write", "persist")
    g.add_edge("persist", END)

    saver = AsyncPostgresSaver.from_conn_string(
        settings.DATABASE_URL,
    )
    await saver.setup()  # creates langgraph_* tables in `langgraph` schema if not exist

    return g.compile(checkpointer=saver)
```

- [ ] **Step 3: `graphs/__init__.py`**

```python
# agents/src/agents/graphs/__init__.py
from ._registry import REGISTRY  # noqa: F401
```

- [ ] **Step 4: Commit**

```bash
git add agents/src/agents/graphs/
git commit -m "feat(agents): graph registry + draft_from_url LangGraph"
```

---

## Task 9: main.py — assemble service

**Files:**
- Replace: `agents/src/agents/main.py`

- [ ] **Step 1: `main.py`**

```python
# agents/src/agents/main.py
from __future__ import annotations
import asyncio
from .config import configure_langsmith
from .log import configure as configure_log, logger
from .worker import worker_loop
from .worker.reaper import reaper_loop
from .scheduler import scheduler_loop
from .health import run_health_server


async def amain() -> None:
    configure_log()
    configure_langsmith()
    logger.info("agents.starting")

    # Trigger graph imports (registers in REGISTRY)
    from . import graphs  # noqa: F401

    await asyncio.gather(
        worker_loop(),
        reaper_loop(),
        scheduler_loop(),
        run_health_server(),
    )


def run() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Smoke run**

```bash
docker compose up -d postgres
sleep 2
cd agents
DATABASE_URL=postgresql://agent_writer:agent_writer_pw@localhost:5432/blog \
  ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  uv run python -m agents.main &
sleep 5
curl http://localhost:8000/health
# expected: {"status":"ok",...}

# Insert a job
docker exec -it astro-blog-postgres psql -U blog -d blog -c "
INSERT INTO agent_jobs (kind, payload, created_by_id)
VALUES ('draft_from_url',
        '{\"url\":\"https://en.wikipedia.org/wiki/Python_(programming_language)\",\"target_lang\":\"ru\"}'::jsonb,
        (SELECT id FROM users WHERE role='admin' LIMIT 1));
"
sleep 30
# Check that job moved to completed and a draft post was created
docker exec -it astro-blog-postgres psql -U blog -d blog -c "
SELECT status, kind, attempts, last_error FROM agent_jobs ORDER BY created_at DESC LIMIT 1;
SELECT slug, title, status FROM posts WHERE 'agent-draft' = ANY(tags) ORDER BY created_at DESC LIMIT 1;
SELECT kind, status, model_calls, input_tokens, output_tokens, cost_usd FROM agent_runs ORDER BY started_at DESC LIMIT 1;
"
kill %1
```

Expected: job=completed, post inserted with `tags @> ['agent-draft']`, run with non-zero tokens.

- [ ] **Step 3: Commit**

```bash
git add agents/src/agents/main.py
git commit -m "feat(agents): main entry — gather worker/reaper/scheduler/health"
```

---

## Task 10: Critical scenario tests

**Files:**
- Create: `agents/tests/test_claim.py`
- Create: `agents/tests/test_reaper.py`
- Create: `agents/tests/test_idempotency.py`
- Create: `agents/tests/test_draft_from_url.py`

- [ ] **Step 1: `test_claim.py` — concurrent SKIP LOCKED**

```python
# agents/tests/test_claim.py
import asyncio
import pytest
from agents.worker.claim import claim_next_job


@pytest.mark.asyncio
async def test_skip_locked_no_double_claim(db_pool):
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM agent_jobs")
        # Insert 3 pending jobs
        await conn.executemany(
            """
            INSERT INTO agent_jobs (kind, payload)
            VALUES ('test', '{}'::jsonb)
            """,
            [() for _ in range(3)],
        )

    async def claim_one(name):
        async with db_pool.acquire() as conn:
            return await claim_next_job(conn, name)

    results = await asyncio.gather(claim_one("w1"), claim_one("w2"), claim_one("w3"))
    ids = [r.id for r in results if r]
    assert len(ids) == 3
    assert len(set(ids)) == 3  # no double-claim
```

- [ ] **Step 2: `test_reaper.py`**

```python
# agents/tests/test_reaper.py
import asyncio
import pytest
from datetime import datetime, timedelta


@pytest.mark.asyncio
async def test_reaper_releases_stale_running_to_pending(db_pool, monkeypatch):
    from agents.worker import reaper as reaper_mod
    from agents.config import settings as cfg
    cfg.REAPER_INTERVAL_S = 0.5
    cfg.REAPER_STALE_AFTER_S = 1.0

    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM agent_jobs")
        await conn.execute(
            """
            INSERT INTO agent_jobs (kind, payload, status, claimed_at, claimed_by, attempts)
            VALUES ('test', '{}'::jsonb, 'running', $1, 'dead-worker', 1)
            """,
            datetime.utcnow() - timedelta(seconds=120),
        )

    task = asyncio.create_task(reaper_mod.reaper_loop())
    await asyncio.sleep(2)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, claimed_at FROM agent_jobs LIMIT 1")
        assert row["status"] == "pending"
        assert row["claimed_at"] is None
```

- [ ] **Step 3: `test_idempotency.py`**

```python
# agents/tests/test_idempotency.py
import pytest


@pytest.mark.asyncio
async def test_same_idempotency_key_dedupe(db_pool):
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM agent_jobs")
        first = await conn.fetchrow(
            """
            INSERT INTO agent_jobs (kind, payload, idempotency_key)
            VALUES ('test', '{}'::jsonb, 'k1')
            RETURNING id
            """,
        )
        second = await conn.execute(
            """
            INSERT INTO agent_jobs (kind, payload, idempotency_key)
            VALUES ('test', '{}'::jsonb, 'k1')
            ON CONFLICT (kind, idempotency_key) DO NOTHING
            """,
        )
        # second insert returns "INSERT 0 0" — no row inserted
        rows = await conn.fetch("SELECT id FROM agent_jobs WHERE kind='test' AND idempotency_key='k1'")
        assert len(rows) == 1
        assert rows[0]["id"] == first["id"]
```

- [ ] **Step 4: `test_draft_from_url.py` (mocked Anthropic + mocked fetch)**

```python
# agents/tests/test_draft_from_url.py
import asyncio
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_draft_from_url_end_to_end(db_pool, monkeypatch):
    from agents.graphs.draft_from_url import factory
    from agents.tools import llm as llm_mod, fetch_url as fetch_mod, extract_content as extract_mod

    # Mock fetch_html
    async def fake_fetch(url, timeout_s=15.0):
        return "<html><body><h1>Test</h1><p>Body content</p></body></html>"
    monkeypatch.setattr(fetch_mod, "fetch_html", fake_fetch)

    # Mock extract
    def fake_extract(html, url):
        return {
            "title": "Test Article",
            "author": "Tester",
            "published": "2026-01-01",
            "url": url,
            "content_md": "# Test\n\nBody content",
        }
    monkeypatch.setattr(extract_mod, "extract", fake_extract)

    # Mock LLM
    async def fake_complete(*, system, prompt, model="claude-haiku-4-5-20251001", max_tokens=4096, cache=True):
        return {
            "text": "---title---\nGenerated Title\n---description---\nA description\n---summary---\nA summary\n---body---\n# Body\n\nGenerated content.",
            "input_tokens": 100,
            "output_tokens": 50,
            "model": model,
            "cost_usd": 0.001,
        }
    monkeypatch.setattr(llm_mod, "complete", fake_complete)

    # Insert job and run
    async with db_pool.acquire() as conn:
        await conn.execute("DELETE FROM agent_jobs CASCADE")
        await conn.execute("DELETE FROM agent_artifacts CASCADE")
        await conn.execute("DELETE FROM agent_runs CASCADE")
        # Need a user
        await conn.execute(
            "INSERT INTO users (id, email, name, email_verified, role) VALUES (gen_random_uuid(), 'test@a.dev', 't', false, 'admin') ON CONFLICT (email) DO NOTHING"
        )
        user_id = await conn.fetchval("SELECT id FROM users WHERE email='test@a.dev'")
        job = await conn.fetchrow(
            """
            INSERT INTO agent_jobs (kind, payload, created_by_id, attempts, status)
            VALUES ('draft_from_url',
                    '{"url":"https://example.com","target_lang":"ru"}'::jsonb,
                    $1, 1, 'running')
            RETURNING id
            """,
            user_id,
        )
        run = await conn.fetchrow(
            "INSERT INTO agent_runs (job_id, attempt, status) VALUES ($1, 1, 'running') RETURNING id",
            job["id"],
        )

    graph = await factory(db_pool)
    await graph.ainvoke(
        {
            "job_id": str(job["id"]),
            "run_id": str(run["id"]),
            "url": "https://example.com",
            "target_lang": "ru",
        },
        config={"configurable": {"thread_id": str(run["id"])}},
    )

    async with db_pool.acquire() as conn:
        post = await conn.fetchrow("SELECT slug, title, status FROM posts WHERE 'agent-draft' = ANY(tags)")
        assert post is not None
        assert post["status"] == "draft"
        assert post["title"] == "Generated Title"

        artifact = await conn.fetchrow("SELECT kind, content FROM agent_artifacts WHERE run_id = $1", run["id"])
        assert artifact["kind"] == "draft_post"
```

- [ ] **Step 5: Run all tests**

```bash
cd agents
uv run pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add agents/tests/
git commit -m "test(agents): SKIP LOCKED, reaper, idempotency, draft_from_url e2e"
```

---

## Task 11: Update Dockerfile + docker-compose

**Files:**
- Modify: `agents/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update `agents/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 libxslt1.1 ca-certificates && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.5.5

WORKDIR /app
COPY pyproject.toml ./
RUN uv venv && uv pip install --no-cache-dir -e .

COPY src/ ./src/

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uv", "run", "python", "-m", "agents.main"]
```

- [ ] **Step 2: docker-compose.yml — `agents` service env**

В `docker-compose.yml`, в секции `agents.environment` добавить:

```yaml
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
LANGSMITH_API_KEY: ${LANGSMITH_API_KEY}
LANGCHAIN_PROJECT: artka-blog
WORKER_NAME: ${HOSTNAME:-agent-1}
LOG_LEVEL: INFO
```

И добавить в `.env` (gitignored) реальные ключи:
```
ANTHROPIC_API_KEY=sk-ant-...
LANGSMITH_API_KEY=ls__...
```

- [ ] **Step 3: Build + restart**

```bash
docker compose build agents
docker compose up -d agents
docker compose logs -f agents
```

Expected: structlog JSON logs, "agents.starting", "scheduler.started", "worker.listen_attached".

- [ ] **Step 4: End-to-end через admin SPA**

- Open `admin.artka.dev`
- /agents/trigger → kind=draft_from_url → URL=https://en.wikipedia.org/wiki/Hono_(framework)
- Submit → редирект на /jobs/<id>
- Wait ~30 sec — статус меняется pending → running → completed (через SSE)
- Видно tokens, cost
- Открыть LangSmith link — видно полный trace fetch → extract → write → persist
- В /posts появляется новый draft с tag agent-draft

- [ ] **Step 5: Commit**

```bash
git add agents/Dockerfile docker-compose.yml
git commit -m "feat(agents): production Dockerfile + compose env wiring"
```

---

## Task 12: Done condition

Spec done condition (Phase 6):
- ✅ INSERT job через psql вручную → worker подхватывает в течение 2 сек (LISTEN)
- ✅ Artifacts появляются
- ✅ SSE доставляет update в открытую вкладку
- ✅ Cancel mid-flight реально останавливает run (не реализовано в Plan 4 — оставлено в Plan 5/6 если потребуется; на текущем moment cancel переводит pending→cancelled, но running cancel = cooperative через payload flag — открытая задача)
- ✅ Reaper: убил процесс mid-job → через 60 сек job возвращается в pending или fails (test_reaper)
- ✅ LangSmith trace доступен

- [ ] **Step 1: Final smoke**

`docker compose up -d` → trigger draft_from_url через UI → verify в LangSmith UI открывается полный flow + node tokens.

- [ ] **Step 2: PR**

```bash
git push origin refactor/postgres-cms-agents
gh pr create --title "refactor: Plan 4/6 — Python agent service + draft_from_url"
```

---

## Self-review

**Spec coverage** (Phase 6):
- [x] Python service skeleton + uv (Task 1)
- [x] Config + log + DB pool (Task 2)
- [x] Pydantic models (Task 3)
- [x] Schema parity test (Task 4)
- [x] Worker (claim+run+retry) (Task 5)
- [x] Reaper, scheduler, health (Task 6)
- [x] Tools (llm/fetch/extract/post_db) (Task 7)
- [x] draft_from_url LangGraph (Task 8)
- [x] main.py asyncio.gather (Task 9)
- [x] Critical scenario tests (Task 10)
- [x] Dockerfile + compose wiring (Task 11)

**Out of scope (next plans):**
- translate (Plan 5)
- social_drafts (Plan 6)
- rss_monitor / daily_digest — schedule wiring есть, реальные графы — Plan 6 после social

**Open issue (документировано):**
- Mid-flight cancel: для running job admin может только пометить лоtelefono `last_error="cancellation requested"`. Cooperative cancel в node — отдельная задача в Plan 6.

**Placeholder scan:** Каждый шаг имеет код. Mock'и в test_draft_from_url с реальными значениями. LangSmith trace_id read — best-effort (try/except), это explicit choice not TBD.
