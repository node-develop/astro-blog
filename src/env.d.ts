/// <reference types="astro/client" />

declare module "*?pagefind" {
  // Placeholder so TS treats this query-style import as a module.
  // The real Pagefind API is loaded at runtime from /pagefind/pagefind.js
  // and described by the global PagefindApi interface below.
  const _: never;
  export default _;
}

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

interface PagefindResult {
  readonly id: string;
  readonly data: () => Promise<{
    readonly url: string;
    readonly excerpt: string;
    readonly meta: Record<string, string>;
  }>;
}

interface PagefindApi {
  readonly search: (query: string) => Promise<{ readonly results: readonly PagefindResult[] }>;
}

interface Window {
  __pagefind?: PagefindApi;
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
