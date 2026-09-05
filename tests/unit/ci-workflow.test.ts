import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "~/lib/yaml";
import { describe, expect, it } from "vitest";

interface WorkflowStep {
  readonly name?: string;
  readonly run?: string;
}

interface Workflow {
  readonly jobs: {
    readonly validate: {
      readonly steps: readonly WorkflowStep[];
    };
  };
}

interface PackageManifest {
  readonly scripts: Record<string, string>;
}

describe("CI indexing recovery gates", () => {
  it("forces a fresh Astro content build before rebuilding the search index", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.scripts.build).toBe("astro build --force && pnpm pagefind:rebuild");
  });

  it("builds fresh output before unit/runtime audits and installs Playwright Chromium", () => {
    const workflow = load(
      readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8"),
    ) as Workflow;
    const commands = workflow.jobs.validate.steps
      .map((step) => step.run)
      .filter((command): command is string => Boolean(command));

    const position = (command: string): number =>
      commands.findIndex((candidate) => candidate === command);

    expect(position("pnpm exec playwright install --with-deps chromium")).toBeGreaterThan(-1);
    expect(position("pnpm verify:seo-build")).toBeGreaterThan(
      position("pnpm exec playwright install --with-deps chromium"),
    );
    expect(position("pnpm exec vitest run --exclude 'tests/integration/**'")).toBeGreaterThan(
      position("pnpm verify:seo-build"),
    );
    expect(position("pnpm test:production-smoke")).toBeGreaterThan(
      position("pnpm exec vitest run --exclude 'tests/integration/**'"),
    );
    expect(
      position("pnpm exec vitest run tests/integration/seo-utility-routes.test.ts"),
    ).toBeGreaterThan(position("pnpm test:production-smoke"));
    expect(position("pnpm translate:check")).toBeGreaterThan(
      position("pnpm exec vitest run tests/integration/seo-utility-routes.test.ts"),
    );
    expect(position("pnpm typecheck")).toBeGreaterThan(position("pnpm translate:check"));
    expect(position("pnpm lint")).toBeGreaterThan(position("pnpm typecheck"));
  });
});
