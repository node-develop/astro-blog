import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "~/lib/yaml";
import { describe, expect, it } from "vitest";

interface WorkflowStep {
  readonly name?: string;
  readonly run?: string;
  readonly "continue-on-error"?: boolean;
}

interface WorkflowJob {
  readonly "runs-on": string;
  readonly needs?: string | readonly string[];
  readonly "timeout-minutes"?: number;
  readonly steps: readonly WorkflowStep[];
}

interface Workflow {
  readonly jobs: {
    readonly validate: WorkflowJob;
    readonly integration: WorkflowJob;
  };
}

interface PackageManifest {
  readonly scripts: Record<string, string>;
}

const readWorkflow = (): Workflow =>
  load(readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8")) as Workflow;

const runCommands = (job: WorkflowJob): readonly string[] =>
  job.steps.map((step) => step.run).filter((command): command is string => Boolean(command));

describe("CI indexing recovery gates", () => {
  it("forces a fresh Astro content build before rebuilding the search index", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.scripts.build).toBe("astro build --force && pnpm pagefind:rebuild");
  });

  it("builds fresh output before unit/runtime audits and installs Playwright Chromium", () => {
    const commands = runCommands(readWorkflow().jobs.validate);

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

  it("audits production dependencies without blocking the pipeline", () => {
    const audit = readWorkflow().jobs.validate.steps.find((step) =>
      step.run?.startsWith("pnpm audit"),
    );

    expect(audit?.run).toBe("pnpm audit --prod --audit-level=high");
    expect(audit?.["continue-on-error"]).toBe(true);
  });
});

describe("CI integration job", () => {
  it("runs the Postgres-backed suites in a separate job that does not wait on validate", () => {
    const { integration } = readWorkflow().jobs;

    expect(integration["runs-on"]).toBe("ubuntu-latest");
    expect(integration.needs).toBeUndefined();
    expect(integration["timeout-minutes"]).toBe(20);
  });

  it("covers exactly the integration suites that validate excludes", () => {
    const commands = runCommands(readWorkflow().jobs.integration);
    const vitest = commands.find((command) => command.startsWith("pnpm exec vitest run"));

    expect(commands).toContain("pnpm install --frozen-lockfile");
    expect(vitest).toBeDefined();
    expect(vitest).toContain("tests/integration");
    // These two run in `validate` against the production build; keep them out here.
    expect(vitest).toContain("--exclude tests/integration/production-server.smoke.test.ts");
    expect(vitest).toContain("--exclude tests/integration/seo-utility-routes.test.ts");
  });
});
