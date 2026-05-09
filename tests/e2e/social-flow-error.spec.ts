import { test } from "@playwright/test";

/**
 * Error path e2e for social autopost.
 *
 * Deferred — same blocker as social-flow.spec.ts: needs Anthropic + social-API
 * mocking at the dev-server boundary. Once available, restore:
 *
 *   it("LinkedIn 401 surfaces as failed with OAuth refresh hint", ...)
 *
 * Action-level coverage already exercises the equivalent:
 *   tests/integration/actions/socialDrafts.publish.test.ts
 *     · "transitions to failed on non-retryable transport error"
 */
test.skip("LinkedIn 401 surfaces as failed with OAuth refresh hint", async () => {
  // intentionally empty — see comment block above
});
