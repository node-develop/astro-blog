/// <reference types="astro/client" />

declare module "probe-image-size/sync.js" {
  interface ProbeResult {
    width: number;
    height: number;
    type: string;
    mime: string;
    wUnits: string;
    hUnits: string;
  }
  function probe(buf: Buffer): ProbeResult | null;
  export default probe;
}

declare namespace App {
  interface Locals {
    user: {
      id: string;
      email: string;
      name?: string | null | undefined;
      image?: string | null | undefined;
      emailVerified?: boolean;
      createdAt?: Date;
      updatedAt?: Date;
      role?: string | null | undefined;
      [key: string]: unknown;
    } | null;
    session: {
      id: string;
      userId: string;
      expiresAt: Date;
      [key: string]: unknown;
    } | null;
  }
}

interface ImportMetaEnv {
  readonly SITE_URL: string;
  readonly DATABASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly LOG_LEVEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
