import { z } from "zod";

export const WRITER_MODEL = "claude-haiku-4-5-20251001";
export const EDITOR_MODEL = "claude-sonnet-4-6";
export const CRITIC_MODEL = "claude-sonnet-4-6";

export const ARTICLE_BODY_TRUNCATE = 3000;

export const isSocialEnabled = (): boolean => process.env.SOCIAL_DRAFTS_ENABLED === "true";

const SocialEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  X_OAUTH_TOKEN: z.string().min(1),
  X_OAUTH_REFRESH: z.string().min(1),
  X_HANDLE: z.string().min(1),
  LINKEDIN_ACCESS_TOKEN: z.string().min(1),
  LINKEDIN_REFRESH_TOKEN: z.string().min(1),
  LINKEDIN_PERSON_URN: z.string().regex(/^urn:li:person:/),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
});

export type SocialEnv = z.infer<typeof SocialEnvSchema>;

/** Validates env. Returns Zod result; do NOT throw — caller decides. */
export const validateSocialEnv = ():
  { ok: true; env: SocialEnv } | { ok: false; issues: string[] } => {
  const r = SocialEnvSchema.safeParse(process.env);
  if (r.success) return { ok: true, env: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
};
