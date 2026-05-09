import { test } from "@playwright/test";

/**
 * Happy path e2e for social autopost.
 *
 * Deferred — requires test instrumentation that isn't in place yet:
 *   1. A way to set SOCIAL_DRAFTS_ENABLED=true on the dev server used by Playwright
 *      (tests/e2e/global-setup.ts currently doesn't export an env hook for this).
 *   2. Anthropic SDK mocking at the dev-server boundary (msw + esbuild plugin or
 *      `__VITE_DEV_HOOK__`-style override). Recorded fixtures from
 *      tests/fixtures/anthropic/ should drive the response.
 *   3. Social API mocking for X / LinkedIn / Telegram during the publish click.
 *
 * Once those land, restore these scenarios:
 *
 *   it("admin publishes a post, edits the X-EN draft, publishes the channel", ...)
 *
 * Coverage of action-level behaviour is already in
 *   tests/integration/actions/socialDrafts.publish.test.ts (5 tests)
 *   tests/integration/actions/socialDrafts.actions.test.ts (5 tests)
 *   tests/integration/actions/socialDrafts.generate.test.ts (4 tests)
 * which exercises the same publish.one → generate → persist → publish flow
 * minus the UI layer.
 */
test.skip("admin publishes a post, edits the X-EN draft, publishes the channel", async () => {
  // intentionally empty — see comment block above
});
