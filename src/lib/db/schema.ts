import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  integer,
  pgEnum,
  jsonb,
  serial,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

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

export { primaryKey };
