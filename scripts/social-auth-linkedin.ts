/**
 * Usage: pnpm social:auth:linkedin
 *
 * 1. Prints an authorization URL.
 * 2. Operator opens URL, approves, copies the `code` param.
 * 3. Operator pastes code; script exchanges for access token.
 * 4. Prints lines for .env: LINKEDIN_ACCESS_TOKEN=..., optionally LINKEDIN_REFRESH_TOKEN=...
 *
 * Does NOT write to .env — operator copies manually.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes } from "node:crypto";

const CALLBACK = "http://localhost:8421/linkedin/callback";

const main = async (): Promise<void> => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: "openid email w_member_social",
    state,
  });

  console.warn("\nOpen this URL in your browser:\n");
  console.warn(`  https://www.linkedin.com/oauth/v2/authorization?${params}\n`);
  console.warn("After approving, copy the `code` param from the redirect URL.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  const code = (await rl.question("Paste code: ")).trim();
  rl.close();

  const tokenResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResp.ok) {
    console.error("Token exchange failed:", await tokenResp.text());
    process.exit(1);
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  console.warn("\nAdd to .env:\n");
  console.warn(`LINKEDIN_ACCESS_TOKEN=${tokens.access_token}`);
  if (tokens.refresh_token) console.warn(`LINKEDIN_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.warn(`# expires in ${tokens.expires_in}s\n`);
  console.warn(
    "# Don't forget LINKEDIN_PERSON_URN — get it from /v2/userinfo or LinkedIn dashboard\n",
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
