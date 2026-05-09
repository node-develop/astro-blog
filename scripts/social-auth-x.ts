/**
 * Usage: pnpm social:auth:x
 *
 * 1. Prints an authorization URL with PKCE.
 * 2. Operator opens URL, approves, copies the `code` param from the redirect.
 * 3. Operator pastes the code; script exchanges for access+refresh tokens.
 * 4. Prints two lines for .env:  X_OAUTH_TOKEN=...  X_OAUTH_REFRESH=...
 *
 * Does NOT write to .env — operator copies manually.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes, createHash } from "node:crypto";

const CALLBACK = "http://localhost:8421/callback";

const main = async (): Promise<void> => {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set X_CLIENT_ID and X_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  console.warn("\nOpen this URL in your browser:\n");
  console.warn(`  https://twitter.com/i/oauth2/authorize?${params}\n`);
  console.warn("After approving, copy the `code` param from the redirect URL.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  const code = (await rl.question("Paste code: ")).trim();
  rl.close();

  const tokenResp = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK,
      code_verifier: verifier,
      client_id: clientId,
    }),
  });

  if (!tokenResp.ok) {
    console.error("Token exchange failed:", await tokenResp.text());
    process.exit(1);
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token: string;
  };
  console.warn("\nAdd to .env:\n");
  console.warn(`X_OAUTH_TOKEN=${tokens.access_token}`);
  console.warn(`X_OAUTH_REFRESH=${tokens.refresh_token}\n`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
