/**
 * Astro Actions for /admin/social: thin wrappers around src/lib/social/service.ts that keep the
 * input and output shapes the admin UI (DraftCard) already uses. They go away in stage 3 with the
 * move of the admin to the content API (docs/superpowers/plans/2026-10-03-api-only-migration.md).
 */
import { ActionError, defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { assertAdmin } from "./_auth.js";
import { isApiError } from "~/lib/content-api/errors";
import { logger as log } from "~/lib/logger";
import type { ArticleSource } from "~/lib/social/article";
import {
  kickoffSocial,
  publishDraft,
  recheckDraft,
  regenerate,
  saveDraft,
  skipDraft,
  type Actor,
} from "~/lib/social/service";
import type { CriticNote, SocialChannel } from "~/lib/social/types.js";

type AdminContext = Pick<ActionAPIContext, "locals">;

const adminActor = (ctx: AdminContext): Actor => {
  const user = ctx.locals.user as { id?: string; role?: string | null } | null;
  assertAdmin(user);
  return { userId: user?.id ?? null };
};

const ACTION_CODES: Readonly<Record<string, ConstructorParameters<typeof ActionError>[0]["code"]>> =
  {
    critic_block: "BAD_REQUEST",
    draft_not_pending: "CONFLICT",
    article_not_published: "CONFLICT",
    social_disabled: "FORBIDDEN",
    not_found: "NOT_FOUND",
    article_not_found: "NOT_FOUND",
  };

/** Service errors keep their message; the code becomes the matching ActionError code. */
const guarded = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (!isApiError(error)) throw error;
    throw new ActionError({
      code: ACTION_CODES[error.code] ?? "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }
};

/** The form stays silent when the row is gone or no longer pending, as it always was. */
const silentWhenStale = async (op: string, id: string, run: () => Promise<unknown>) => {
  try {
    await guarded(run);
  } catch (error) {
    if (
      !(error instanceof ActionError) ||
      (error.code !== "NOT_FOUND" && error.code !== "CONFLICT")
    )
      throw error;
    log.warn({ mod: "social", id, op, reason: error.message }, "social draft not changed");
  }
  return { ok: true as const };
};

// ── Handlers (plain functions — callable in tests without the Astro runtime) ─

export type GenerateInput = {
  slug: string;
  collection: "posts";
  channels?: SocialChannel[] | undefined;
  /** publish.one passes `file`: it has just pushed that file and must draft from it. */
  source?: ArticleSource | undefined;
};

export type GenerateResult =
  { ok: true; channels: SocialChannel[] } | { ok: false; reason: string };

const kickoffResult = (result: Awaited<ReturnType<typeof kickoffSocial>>): GenerateResult =>
  result.ok ? { ok: true, channels: result.channels } : { ok: false, reason: result.reason };

export const generateHandler = async (
  { slug, channels, source }: GenerateInput,
  ctx: ActionAPIContext,
): Promise<GenerateResult> => {
  const actor = adminActor(ctx);
  return kickoffResult(await guarded(() => kickoffSocial({ slug, channels, actor, source })));
};

export type PublishInput = { id: string; force: boolean };
export type PublishResult = { ok: true; url: string } | { ok: false; error: string };

export const publishHandler = async (
  { id, force }: PublishInput,
  ctx: ActionAPIContext,
): Promise<PublishResult> => {
  const actor = adminActor(ctx);
  const result = await guarded(() => publishDraft({ id, force, actor }));
  return result.ok ? { ok: true, url: result.url } : { ok: false, error: result.error };
};

export type SaveInput = { id: string; body: string; threadTail?: string[] | undefined };

export const saveHandler = async (
  { id, body, threadTail }: SaveInput,
  ctx: ActionAPIContext,
): Promise<{ ok: true }> => {
  adminActor(ctx);
  return silentWhenStale("save", id, () => saveDraft({ id, body, threadTail }));
};

export type SkipInput = { id: string; reason?: string | undefined };

export const skipHandler = async (
  { id, reason }: SkipInput,
  ctx: ActionAPIContext,
): Promise<{ ok: true }> => {
  adminActor(ctx);
  return silentWhenStale("skip", id, () => skipDraft({ id, reason }));
};

export type RecheckInput = { id: string };
export type RecheckResult = { ok: true; annotations: CriticNote[] };

export const recheckHandler = async (
  { id }: RecheckInput,
  ctx: ActionAPIContext,
): Promise<RecheckResult> => {
  adminActor(ctx);
  const { annotations } = await guarded(() => recheckDraft({ id }));
  return { ok: true, annotations };
};

export type RegenerateInput = { slug: string; collection: "posts" };

export const regenerateHandler = async (
  { slug }: RegenerateInput,
  ctx: ActionAPIContext,
): Promise<GenerateResult> => {
  const actor = adminActor(ctx);
  return kickoffResult(await guarded(() => regenerate({ slug, actor })));
};

// ── Action ────────────────────────────────────────────────────────────────────

export const socialDrafts = {
  generate: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.literal("posts").default("posts"),
      channels: z.array(z.enum(["x_en", "li_en", "tg_ru"])).optional(),
    }),
    handler: async (input, ctx) => generateHandler(input, ctx),
  }),
  publish: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      force: z.boolean().default(false),
    }),
    handler: async (input, ctx) =>
      publishHandler({ id: input.id, force: input.force ?? false }, ctx),
  }),
  save: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      body: z.string(),
      threadTail: z.array(z.string()).optional(),
    }),
    handler: async (input, ctx) => saveHandler(input, ctx),
  }),
  skip: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      reason: z.string().optional(),
    }),
    handler: async (input, ctx) => skipHandler(input, ctx),
  }),
  recheck: defineAction({
    accept: "json",
    input: z.object({ id: z.uuid() }),
    handler: async (input, ctx) => recheckHandler(input, ctx),
  }),
  regenerate: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.literal("posts").default("posts"),
    }),
    handler: async (input, ctx) => regenerateHandler(input, ctx),
  }),
};
