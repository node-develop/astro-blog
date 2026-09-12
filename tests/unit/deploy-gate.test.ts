import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load } from "~/lib/yaml";

describe("deployment validation gate", () => {
  it("requires all CI jobs from the same commit before publishing an image or deploying", () => {
    const ci = load(readFileSync(".github/workflows/ci.yml", "utf8")) as any;
    const release = load(readFileSync(".github/workflows/docker-publish.yml", "utf8")) as any;
    expect(ci.on).toHaveProperty("workflow_call");
    expect(ci.on).toHaveProperty("pull_request");
    expect(ci.on).not.toHaveProperty("push");
    expect(release.jobs.validate.uses).toBe("./.github/workflows/ci.yml");
    const build = release.jobs["build-and-push"];
    expect(build.needs).toBe("validate");
    expect(build.if).toBeUndefined();
    expect(release.jobs.validate["continue-on-error"]).toBeUndefined();
    expect(Object.keys(ci.jobs).sort()).toEqual(["integration", "validate"]);
    for (const job of Object.values(ci.jobs) as any[]) {
      expect(job.if).toBeUndefined();
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps.filter((s: any) => s.run && !s.run.startsWith("pnpm audit"))) {
        expect(step["continue-on-error"]).toBeUndefined();
      }
    }
    expect(ci.jobs.validate.steps.some((step: any) => step.run === "pnpm lint")).toBe(true);
    const webhook = build.steps.find((step: any) => step.name === "Trigger Dokploy deploy");
    expect(webhook.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(release.on.push.branches).toEqual(["main"]);
  });
});
