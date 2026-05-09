import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSocialEnabled, validateSocialEnv } from "~/lib/social/config";

const ENV_KEYS = [
  "SOCIAL_DRAFTS_ENABLED",
  "ANTHROPIC_API_KEY",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_OAUTH_TOKEN",
  "X_OAUTH_REFRESH",
  "X_HANDLE",
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_REFRESH_TOKEN",
  "LINKEDIN_PERSON_URN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isSocialEnabled", () => {
  it("false when env not set", () => {
    expect(isSocialEnabled()).toBe(false);
  });
  it("true when set to 'true'", () => {
    process.env.SOCIAL_DRAFTS_ENABLED = "true";
    expect(isSocialEnabled()).toBe(true);
  });
  it("false when set to 'false' or other", () => {
    process.env.SOCIAL_DRAFTS_ENABLED = "false";
    expect(isSocialEnabled()).toBe(false);
    process.env.SOCIAL_DRAFTS_ENABLED = "1";
    expect(isSocialEnabled()).toBe(false);
  });
});

describe("validateSocialEnv", () => {
  it("returns issues when env empty", () => {
    const r = validateSocialEnv();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("validates LINKEDIN_PERSON_URN format", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.X_CLIENT_ID = "k";
    process.env.X_CLIENT_SECRET = "k";
    process.env.X_OAUTH_TOKEN = "k";
    process.env.X_OAUTH_REFRESH = "k";
    process.env.X_HANDLE = "h";
    process.env.LINKEDIN_ACCESS_TOKEN = "k";
    process.env.LINKEDIN_REFRESH_TOKEN = "k";
    process.env.LINKEDIN_PERSON_URN = "not-a-urn";
    process.env.TELEGRAM_BOT_TOKEN = "k";
    process.env.TELEGRAM_CHANNEL_ID = "@x";
    const r = validateSocialEnv();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.includes("LINKEDIN_PERSON_URN"))).toBe(true);
  });

  it("ok when all env present and valid", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.X_CLIENT_ID = "k";
    process.env.X_CLIENT_SECRET = "k";
    process.env.X_OAUTH_TOKEN = "k";
    process.env.X_OAUTH_REFRESH = "k";
    process.env.X_HANDLE = "h";
    process.env.LINKEDIN_ACCESS_TOKEN = "k";
    process.env.LINKEDIN_REFRESH_TOKEN = "k";
    process.env.LINKEDIN_PERSON_URN = "urn:li:person:abc123";
    process.env.TELEGRAM_BOT_TOKEN = "k";
    process.env.TELEGRAM_CHANNEL_ID = "@artka_blog";
    const r = validateSocialEnv();
    expect(r.ok).toBe(true);
  });
});
