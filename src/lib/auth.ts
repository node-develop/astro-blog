import "./env.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/index.js";

export type Auth = ReturnType<typeof createAuth>;

const trustedProxies = (process.env.AUTH_TRUSTED_PROXIES ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export const createAuth = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.SITE_URL;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
  if (!baseUrl) throw new Error("BETTER_AUTH_URL or SITE_URL is required");

  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const githubEnabled = Boolean(githubClientId && githubClientSecret);
  const isProduction = process.env.NODE_ENV === "production";

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret,
    baseURL: baseUrl,
    advanced: {
      database: {
        generateId: false,
      },
      // `Secure` cookies only in prod: dev/e2e run over plain http://localhost.
      useSecureCookies: isProduction,
      // Rate limiting keys buckets by client IP. With one proxy hop (Traefik) a
      // single-value X-Forwarded-For is trusted as is; with more hops (e.g.
      // Cloudflare → Traefik) list the proxy CIDRs so the chain is walked
      // from the right, otherwise every visitor shares one bucket.
      ...(trustedProxies.length > 0 ? { ipAddress: { trustedProxies } } : {}),
    },
    // Brute-force protection for the credential login. Enabled in prod, and
    // opt-in elsewhere via AUTH_RATE_LIMIT=1 (the e2e suite logs in per test
    // and would trip the 5/min sign-in rule under `pnpm dev`).
    // Paths are relative to the auth basePath, trailing slash normalised.
    rateLimit: {
      enabled: isProduction || process.env.AUTH_RATE_LIMIT === "1",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "reader",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: true,
    },
    socialProviders: githubEnabled
      ? {
          github: {
            clientId: githubClientId!,
            clientSecret: githubClientSecret!,
            disableSignUp: true,
          },
        }
      : undefined,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["github"],
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
  });
};

let cached: Auth | null = null;

const getAuth = (): Auth => {
  if (cached) return cached;
  cached = createAuth();
  return cached;
};

export const auth: Auth = new Proxy({} as Auth, {
  get: (_target, prop) => Reflect.get(getAuth() as object, prop),
});
