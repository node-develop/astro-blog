import { getViteConfig } from "astro/config";
import type { UserConfig } from "vitest/config";

const testConfig: UserConfig["test"] = {
  globals: true,
  environment: "node",
  include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts", "tests/integration/**/*.test.ts"],
  testTimeout: 60_000,
  hookTimeout: 180_000,
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    exclude: ["tests/**", "**/*.config.ts", ".astro/**"],
  },
};

export default getViteConfig({ test: testConfig } as Parameters<typeof getViteConfig>[0]);
