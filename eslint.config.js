import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";
import functional from "eslint-plugin-functional";

export default [
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "drizzle/**",
      "playwright.config.ts",
      "vitest.config.ts",
      "eslint.config.js",
      "*.d.ts",
      "src/env.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      functional,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "functional/no-classes": "error",
      "functional/no-this-expressions": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/lib/db/migrate.ts", "**/*.config.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Tests print diagnostics on failure, and `vi.importActual<typeof import("…")>`
    // is the idiomatic partial-mock pattern, so both are allowed here.
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
    },
  },
  ...astro.configs.recommended,
];
