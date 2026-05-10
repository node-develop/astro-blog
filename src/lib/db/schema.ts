import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  pgEnum,
  jsonb,
  serial,
  primaryKey,
  customType,
  bigserial,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CriticNote } from "~/lib/social/types";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

// ── Better-Auth tables (unchanged) ────────────────────────────

export const userRole = pgEnum("user_role", ["admin", "editor", "reader"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: userRole("role").notNull().default("reader"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: index("users_email_idx").on(t.email) }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("accounts_user_idx").on(t.userId) }),
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ identifierIdx: index("verifications_identifier_idx").on(t.identifier) }),
);

// ── CMS tables (new in Plan 2) ────────────────────────────────

/**
 * Mutable metadata layered over the markdown file for each post.
 * slug = filename (without extension) in src/content/posts/.
 */
export const postsMeta = pgTable(
  "posts_meta",
  {
    slug: text("slug").primaryKey(),
    order: integer("order").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    hiddenFromList: boolean("hidden_from_list").notNull().default(false),
    searchVector: tsvector("search_vector"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("posts_meta_order_idx").on(t.order),
    pinnedIdx: index("posts_meta_pinned_idx").on(t.pinned),
  }),
);

/**
 * Immutable snapshots of a post's frontmatter + body, produced on every
 * create/update. Triggers prune to the most recent 50 per slug.
 */
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugCreatedIdx: index("post_revisions_slug_created_idx").on(t.slug, t.createdAt),
  }),
);

/**
 * Metadata for uploaded media. File bytes live under public/uploads/.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uploadedAtIdx: index("media_assets_uploaded_at_idx").on(t.uploadedAt) }),
);

/**
 * Course progress — one row per (user, course, lesson) completion.
 * Anonymous users keep using localStorage; only authenticated sessions
 * round-trip to this table.
 */
export const courseProgress = pgTable(
  "course_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseSlug: text("course_slug").notNull(),
    lessonSlug: text("lesson_slug").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * "auto"   → IntersectionObserver + dwell-timer fired
     * "manual" → user pressed "Mark complete"
     * "import" → backfill from prior localStorage state
     */
    source: text("source", { enum: ["auto", "manual", "import"] })
      .notNull()
      .default("manual"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.courseSlug, t.lessonSlug] }),
    userCourseIdx: index("course_progress_user_course_idx").on(t.userId, t.courseSlug),
    courseIdx: index("course_progress_course_idx").on(t.courseSlug),
  }),
);

// ── Social autopost outbox ────────────────────────────────────

export const socialChannel = pgEnum("social_channel", ["x_en", "li_en", "tg_ru"]);
export const socialStatus = pgEnum("social_status", [
  "generating",
  "pending",
  "sending",
  "sent",
  "failed",
  "superseded",
  "skipped",
]);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postCollection: text("post_collection").notNull(),
    postSlug: text("post_slug").notNull(),
    channel: socialChannel("channel").notNull(),
    status: socialStatus("status").notNull().default("generating"),

    body: text("body").notNull().default(""),
    threadTail: jsonb("thread_tail").$type<string[] | null>(),
    mediaUrl: text("media_url"),

    criticAnnotations: jsonb("critic_annotations").$type<CriticNote[] | null>(),

    generationModel: text("generation_model"),
    editorModel: text("editor_model"),
    criticModel: text("critic_model"),
    sourceHash: text("source_hash").notNull(),

    externalId: text("external_id"),
    externalUrl: text("external_url"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),

    createdById: uuid("created_by_id").references(() => users.id),
    approvedById: uuid("approved_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index("ix_social_post_slug").on(t.postCollection, t.postSlug),
    statusIdx: index("ix_social_status").on(t.status),
    activePerChannel: uniqueIndex("ux_social_active_per_channel")
      .on(t.postCollection, t.postSlug, t.channel)
      .where(sql`status NOT IN ('superseded', 'skipped', 'failed')`),
  }),
);

// ── Type aliases ──────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PostMeta = typeof postsMeta.$inferSelect;
export type NewPostMeta = typeof postsMeta.$inferInsert;

export type PostRevision = typeof postRevisions.$inferSelect;
export type NewPostRevision = typeof postRevisions.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type CourseProgressRow = typeof courseProgress.$inferSelect;
export type NewCourseProgressRow = typeof courseProgress.$inferInsert;

export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;

export { primaryKey };

// ── Refactor v2: Postgres-as-CMS + agents ─────────────────────

export const postKind = pgEnum("post_kind", ["post", "page", "project"]);
export const postStatus = pgEnum("post_status", ["draft", "published", "unlisted", "archived"]);
export const postLang = pgEnum("post_lang", ["ru", "en"]);

export const agentJobStatus = pgEnum("agent_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const agentRunStatus = pgEnum("agent_run_status", ["running", "completed", "failed"]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    lang: postLang("lang").notNull(),
    kind: postKind("kind").notNull().default("post"),
    status: postStatus("status").notNull().default("draft"),

    title: text("title").notNull(),
    description: text("description").notNull(),
    summary: text("summary"),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    faq: jsonb("faq").$type<{ question: string; answer: string }[] | null>(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    cover: text("cover"),
    coverAlt: text("cover_alt"),
    author: text("author").notNull().default("Артём"),
    pubDate: timestamp("pub_date", { withTimezone: true }).notNull(),
    updatedDate: timestamp("updated_date", { withTimezone: true }),
    extra: jsonb("extra")
      .notNull()
      .default(sql`'{}'::jsonb`),

    bodyMd: text("body_md").notNull(),
    bodyHtml: text("body_html"),
    toc: jsonb("toc").$type<{ slug: string; depth: number; text: string }[] | null>(),
    renderVersion: integer("render_version").notNull().default(0),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),

    sourceHash: text("source_hash"),
    manuallyEdited: boolean("manually_edited").notNull().default(false),

    displayOrder: integer("display_order").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),

    searchVector: tsvector("search_vector"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLangUx: uniqueIndex("posts_slug_lang_ux").on(t.slug, t.lang),
    publishedIdx: index("posts_published_idx")
      .on(t.lang, t.pubDate)
      .where(sql`status = 'published'`),
    searchIdx: index("posts_search_idx").using("gin", t.searchVector),
    tagsIdx: index("posts_tags_idx").using("gin", t.tags),
    kindStatusIdx: index("posts_kind_status_idx").on(t.kind, t.status, t.lang),
  }),
);

export const agentJobs = pgTable(
  "agent_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: agentJobStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index("agent_jobs_pending_idx")
      .on(t.priority, t.runAfter, t.createdAt)
      .where(sql`status = 'pending'`),
    kindIdx: index("agent_jobs_kind_idx").on(t.kind, t.createdAt),
    idempotencyUx: uniqueIndex("agent_jobs_idempotency_ux").on(t.kind, t.idempotencyKey),
  }),
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => agentJobs.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    langgraphThreadId: text("langgraph_thread_id"),
    langsmithTraceId: text("langsmith_trace_id"),
    status: agentRunStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    modelCalls: integer("model_calls").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    error: jsonb("error"),
    finalOutput: jsonb("final_output"),
  },
  (t) => ({
    jobAttemptUx: uniqueIndex("agent_runs_job_attempt_ux").on(t.jobId, t.attempt),
    traceIdx: index("agent_runs_trace_idx").on(t.langsmithTraceId),
  }),
);

export const agentArtifacts = pgTable(
  "agent_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refTable: text("ref_table"),
    refId: text("ref_id"),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("agent_artifacts_kind_idx").on(t.kind, t.createdAt),
    refIdx: index("agent_artifacts_ref_idx").on(t.refTable, t.refId),
  }),
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    type: text("type").notNull(),
    jobId: uuid("job_id"),
    runId: uuid("run_id"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("agent_events_created_idx").on(t.createdAt),
    jobIdx: index("agent_events_job_idx").on(t.jobId),
  }),
);

// ── New type aliases ──────────────────────────────────────────

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type AgentJob = typeof agentJobs.$inferSelect;
export type NewAgentJob = typeof agentJobs.$inferInsert;

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

export type AgentArtifact = typeof agentArtifacts.$inferSelect;
export type NewAgentArtifact = typeof agentArtifacts.$inferInsert;

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
