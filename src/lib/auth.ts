import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/index.js";

const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.SITE_URL;

if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
if (!baseUrl) throw new Error("BETTER_AUTH_URL or SITE_URL is required");

export type Auth = ReturnType<typeof createAuth>;

export const createAuth = () =>
  betterAuth({
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
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
  });

export const auth: Auth = createAuth();
