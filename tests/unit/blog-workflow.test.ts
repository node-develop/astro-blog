import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVIEW_GATES,
  blogDigest,
  checkBlogWorkflow as checkBlogWorkflowRaw,
  safeRepositoryPath,
  type BlogEvidence,
  type BlogFile,
  type BlogWorkflowInput,
} from "~/lib/blog-workflow";
import { contentHash } from "~/lib/translate/hash";

const fixture = (locale: "ru" | "en"): BlogFile => ({
  slug: "draft-boundaries",
  format: "md",
  raw: readFileSync(
    join(
      process.cwd(),
      "tests/fixtures/blog-workflow",
      locale === "en" ? "en/draft-boundaries.md" : "draft-boundaries.md",
    ),
    "utf8",
  ),
});
const ru = fixture("ru");
const en = fixture("en");
const fileExists = (path: string): boolean => existsSync(join(process.cwd(), path));
const checkBlogWorkflow = (input: Omit<BlogWorkflowInput, "asOf">) =>
  checkBlogWorkflowRaw({ ...input, asOf: "2026-10-11" });
const statusOf = (report: ReturnType<typeof checkBlogWorkflow>, id: string) =>
  report.gates.find((gate) => gate.id === id)?.status;
const syncEn = (source: BlogFile, twin: BlogFile = en): BlogFile => ({
  ...twin,
  raw: twin.raw.replace(/^sourceHash:.*$/m, `sourceHash: ${contentHash("posts", source.raw)}`),
});
const evidenceFor = (source: BlogFile = ru, twin: BlogFile = en): BlogEvidence => ({
  version: 1,
  articleDigest: blogDigest(source, twin).articleDigest,
  claims: [
    {
      claim: "draft: true is excluded from article routes",
      sourceUrl: "https://github.com/node-develop/astro-blog",
      sourceTitle: "Repository route implementation",
      checkedAt: "2026-10-11",
      finding: "Both route filters require a non-draft entry.",
      status: "supported",
    },
  ],
  checks: REVIEW_GATES.map((gate) => ({
    gate,
    status: "pass",
    reviewer: "Synthetic test reviewer; not a real inspection",
    details: "Synthetic passing record for contract tests only",
    artifacts: ["synthetic-artifact.txt"],
  })),
});

describe("offline blog workflow", () => {
  it("enforces CLI input root, regular-file and size boundaries before reading contents", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "blog-workflow-cli-"));
    const root = join(sandbox, "root");
    mkdirSync(root);
    writeFileSync(join(root, "valid.md"), ru.raw);
    writeFileSync(join(sandbox, "outside.md"), "DO_NOT_OUTPUT_THE_OUTSIDE_CONTENT");
    symlinkSync(join(sandbox, "outside.md"), join(root, "escape.md"));
    mkdirSync(join(root, "directory.md"));
    writeFileSync(join(root, "large.md"), "x".repeat(2 * 1024 * 1024 + 1));
    const run = (args: readonly string[]) =>
      spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/blog-workflow.ts", ...args, "--root", root],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 10_000,
        },
      );
    try {
      const valid = run(["digest", "valid.md"]);
      expect(valid.status).toBe(0);
      expect(JSON.parse(valid.stdout)).toHaveProperty("articleDigest");
      for (const path of ["escape.md", "../outside.md", "directory.md", "large.md"]) {
        const blocked = run(["digest", path]);
        expect(blocked.status, path).toBe(2);
        expect(blocked.stdout).toBe("");
        expect(blocked.stderr).not.toContain("DO_NOT_OUTPUT_THE_OUTSIDE_CONTENT");
      }
      const evidenceEscape = run(["check", "valid.md", "--evidence", "../outside.md"]);
      expect(evidenceEscape.status).toBe(2);
      expect(evidenceEscape.stderr).toContain("outside");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
  it("checks the real bilingual fixture without granting missing render or review passes", () => {
    const report = checkBlogWorkflow({ ru, en, fileExists });
    expect(report.gates.filter((gate) => gate.status === "fail")).toEqual([]);
    expect(statusOf(report, "schema-ru")).toBe("pass");
    expect(statusOf(report, "schema-en")).toBe("pass");
    expect(statusOf(report, "translation")).toBe("pass");
    expect(statusOf(report, "native-render")).toBe("not-run");
    expect(statusOf(report, "visual-review")).toBe("not-run");
    expect(statusOf(report, "language-metrics")).toBe("advisory");
    expect(report.metrics.ruProseWords).toBeGreaterThan(100);
    expect(report.readyForHandoff).toBe(false);
    expect(report.publicationAuthorized).toBe(false);
    expect(report.urls).toEqual({
      ru: "https://artka.dev/blog/draft-boundaries/",
      en: "https://artka.dev/en/blog/draft-boundaries/",
    });
  });

  it.each([
    [
      "unknown generic metadata",
      (raw: string) => raw.replace("lang: ru", "lang: ru\nheroImage: /hero.png"),
    ],
    ["missing summary", (raw: string) => raw.replace(/^summary:.*\n/m, "")],
    ["missing draft flag", (raw: string) => raw.replace(/^draft: true\n/m, "")],
    ["published flag", (raw: string) => raw.replace("draft: true", "draft: false")],
    ["wrong locale", (raw: string) => raw.replace("lang: ru", "lang: en")],
    ["invalid description", (raw: string) => raw.replace(/^description:.*$/m, "description: x")],
  ])("rejects %s before handoff", (_label, transform) => {
    const badRu = { ...ru, raw: transform(ru.raw) };
    const report = checkBlogWorkflow({ ru: badRu, en: syncEn(badRu), fileExists });
    expect(statusOf(report, "schema-ru")).toBe("fail");
    expect(report.readyForHandoff).toBe(false);
  });

  it("distinguishes native translation hashing from exact artifact review binding", () => {
    const changedRu = { ...ru, raw: ru.raw.replace("  - astro", "  - ai") };
    expect(contentHash("posts", changedRu.raw)).toBe(contentHash("posts", ru.raw));
    expect(blogDigest(changedRu, en).articleDigest).not.toBe(blogDigest(ru, en).articleDigest);
    const report = checkBlogWorkflow({
      ru: changedRu,
      en,
      evidence: evidenceFor(),
      fileExists,
    });
    expect(statusOf(report, "evidence")).toBe("fail");
    expect(statusOf(report, "visual-review")).toBe("not-run");
    expect(statusOf(report, "translation")).toBe("fail");
    const changedEn = { ...en, raw: `${en.raw}\nA reviewed revision.\n` };
    expect(
      statusOf(
        checkBlogWorkflow({ ru, en: changedEn, evidence: evidenceFor(), fileExists }),
        "evidence",
      ),
    ).toBe("fail");
  });

  it("fails stale, absent and unprotected translations even for draft fixtures", () => {
    const changedRu = { ...ru, raw: `${ru.raw}\nДополнение для редактора.\n` };
    expect(statusOf(checkBlogWorkflow({ ru: changedRu, en, fileExists }), "translation")).toBe(
      "fail",
    );
    expect(statusOf(checkBlogWorkflow({ ru, fileExists }), "schema-en")).toBe("not-run");
    const unprotected = {
      ...en,
      raw: en.raw.replace("manuallyEdited: true", "manuallyEdited: false"),
    };
    expect(statusOf(checkBlogWorkflow({ ru, en: unprotected, fileExists }), "translation")).toBe(
      "fail",
    );
  });

  it("accepts only complete current attestations, with actual supporting files", () => {
    const evidence = evidenceFor();
    const complete = checkBlogWorkflow({ ru, en, evidence, fileExists: () => true });
    expect(complete.readyForHandoff).toBe(true);
    expect(complete.publicationAuthorized).toBe(false);
    expect(complete.evidenceMeaning).toContain("attestations");
    const noArtifact = checkBlogWorkflow({ ru, en, evidence, fileExists: () => false });
    expect(statusOf(noArtifact, "visual-review")).toBe("fail");
    const missingVisual = {
      ...evidence,
      checks: evidence.checks.filter((check) => check.gate !== "visual-review"),
    };
    expect(
      statusOf(
        checkBlogWorkflow({ ru, en, evidence: missingVisual, fileExists: () => true }),
        "visual-review",
      ),
    ).toBe("not-run");
    const uncertain = { ...evidence, claims: [{ ...evidence.claims[0]!, status: "uncertain" }] };
    expect(
      statusOf(
        checkBlogWorkflow({ ru, en, evidence: uncertain, fileExists: () => true }),
        "sources",
      ),
    ).toBe("fail");
    const duplicate = { ...evidence, checks: [...evidence.checks, evidence.checks[0]!] };
    expect(
      statusOf(checkBlogWorkflow({ ru, en, evidence: duplicate, fileExists }), "evidence"),
    ).toBe("fail");
  });

  it("never evaluates MDX and keeps native render mandatory", () => {
    const marker = "__blogWorkflowShouldNeverExecute";
    const mdxRu: BlogFile = {
      ...ru,
      format: "mdx",
      raw: `${ru.raw}\n{globalThis.${marker} = true}\n`,
    };
    const mdxEn = syncEn(mdxRu, { ...en, format: "mdx" });
    const report = checkBlogWorkflow({ ru: mdxRu, en: mdxEn, fileExists });
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    expect(statusOf(report, "schema-ru")).toBe("pass");
    expect(statusOf(report, "native-render")).toBe("not-run");
    expect(report.readyForHandoff).toBe(false);
  });

  it("accepts Unicode and encoded RU heading anchors without claiming fragment verification", () => {
    const anchoredRu = {
      ...ru,
      raw: `${ru.raw}\n## Проверка границ\n\n[Раздел](#проверка-границ) [Encoded](#${encodeURIComponent("проверка-границ")}) [Other](/blog/claude-md-12-rules/#проверка)\n`,
    };
    const report = checkBlogWorkflow({ ru: anchoredRu, en: syncEn(anchoredRu), fileExists });
    expect(statusOf(report, "internal-links")).toBe("pass");
    expect(report.gates.find((gate) => gate.id === "internal-links")?.details.join(" ")).toContain(
      "fragments need render review",
    );
    const updatedRu = {
      ...ru,
      raw: ru.raw.replace("pubDate: 2026-10-11", "pubDate: 2026-10-11\nupdatedDate: 2026-10-12"),
    };
    expect(statusOf(checkBlogWorkflow({ ru: updatedRu, en, fileExists }), "translation")).toBe(
      "fail",
    );
  });

  it("rejects changed author metadata and a claim checked in the future", () => {
    const wrongAuthor = {
      ...en,
      raw: en.raw.replace("lang: en", "lang: en\nauthor: Wrong Author"),
    };
    expect(statusOf(checkBlogWorkflow({ ru, en: wrongAuthor, fileExists }), "translation")).toBe(
      "fail",
    );
    const evidence = evidenceFor();
    const future = { ...evidence, claims: [{ ...evidence.claims[0]!, checkedAt: "2099-01-01" }] };
    const report = checkBlogWorkflow({ ru, en, evidence: future, fileExists: () => true });
    expect(statusOf(report, "sources")).toBe("fail");
    expect(report.readyForHandoff).toBe(false);
  });

  it("catches native phrase/Mermaid errors and unsafe, removed or missing references", () => {
    const badRu = {
      ...ru,
      raw: `${ru.raw}\n# Второй H1\n\nВ современном мире.\n\n\`\`\`mermaid\nflowchart LR\nA-->B\n\`\`\`\n\n[old](/courses/claude-code/) [bad](javascript:alert(1)) [missing](/blog/absent/) ![asset](/missing.png)\n`,
    };
    const report = checkBlogWorkflow({ ru: badRu, en: syncEn(badRu), fileExists });
    expect(statusOf(report, "content-ru")).toBe("fail");
    expect(statusOf(report, "internal-links")).toBe("fail");
    expect(statusOf(report, "local-assets")).toBe("fail");
    expect(report.gates.find((gate) => gate.id === "internal-links")?.details.join(" ")).toContain(
      "Intentionally removed",
    );
    expect(
      ["../secret", "/absolute", "a/../../secret", "a\\b", "a//b"].every(
        (path) => !safeRepositoryPath(path),
      ),
    ).toBe(true);
  });
});
