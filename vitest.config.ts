import { getViteConfig } from "astro/config";
import type { ViteUserConfig } from "vitest/config";

// Three layers, selected with `vitest --project <name>` (see "Тесты" in CLAUDE.md):
//   unit  — pure logic, no build, no Docker. `pnpm test`.
//   built — checks the real `dist/` (HTML, JSON-LD, sitemaps, the standalone
//           server). Fails loudly when there is no build. `pnpm test:built`.
//   db    — Postgres via Testcontainers, needs Docker. `pnpm test:db`.
// Projects extend this root config (Vitest 5 default), so Astro's Vite plugins
// and the `~/` alias apply to all of them.
const testConfig: NonNullable<ViteUserConfig["test"]> = {
  globals: true,
  environment: "node",
  testTimeout: 60_000,
  hookTimeout: 180_000,
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    exclude: ["tests/**", "**/*.config.ts", ".astro/**"],
  },
  projects: [
    {
      test: {
        name: "unit",
        include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts"],
      },
    },
    {
      test: {
        name: "built",
        include: ["tests/built/**/*.test.ts"],
        globalSetup: ["tests/built/global-setup.ts"],
      },
    },
    {
      test: {
        name: "db",
        include: ["tests/integration/**/*.test.ts"],
      },
    },
  ],
};

export default getViteConfig({ test: testConfig } as Parameters<typeof getViteConfig>[0]);
