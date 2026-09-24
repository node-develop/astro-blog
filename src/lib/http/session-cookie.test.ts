import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./session-cookie";

describe("hasSessionCookie", () => {
  it.each([
    "better-auth.session_token=x",
    "__Secure-better-auth.session_token=x",
    "theme=dark; better-auth.session_token=abc; locale=en",
  ])("detects a Better-Auth session in %s", (header) => {
    expect(hasSessionCookie(header)).toBe(true);
  });

  it.each([
    null,
    "",
    "theme=dark",
    "=better-auth.session_token",
    "not-better-auth.session_token=x",
    "better-auth.session_token-suffix=x",
    "__Secure-better-auth.session_token-suffix=x",
    "BETTER-AUTH.SESSION_TOKEN=x",
  ])("ignores an absent or inexact session cookie: %s", (header) => {
    expect(hasSessionCookie(header)).toBe(false);
  });
});
