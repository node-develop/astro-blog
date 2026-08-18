import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

type SeoBuildViolation = {
  readonly label: string;
  readonly pattern: RegExp;
};

const VIOLATIONS: ReadonlyArray<SeoBuildViolation> = [
  {
    label: "duplicate redirect route",
    pattern: /static route cannot be defined more than once/i,
  },
  {
    label: "invalid view-transition selector",
    pattern: /::view-transition-group\(\[transition-name\^=/i,
  },
  {
    label: "SEO chunk cycle",
    pattern: /buildLandingNodes[\s\S]{0,500}reexported through module/i,
  },
];

export const assertSeoBuildOutput = (output: string): string[] => {
  const plainOutput = stripVTControlCharacters(output);
  return VIOLATIONS.filter(({ pattern }) => pattern.test(plainOutput)).map(({ label }) => label);
};

const matchingBlock = (output: string, pattern: RegExp): string => {
  const lines = stripVTControlCharacters(output).split("\n");
  const lineIndex = lines.findIndex((line) => pattern.test(line));
  if (lineIndex < 0) return "(matching warning block unavailable)";
  return lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 7)).join("\n");
};

const runBuild = async (): Promise<number> => {
  let output = "";
  const child = spawn("pnpm", ["build"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExit) => {
    child.once("error", (error) => {
      console.error(`[seo-build] Failed to start pnpm build: ${error.message}`);
      resolveExit(1);
    });
    child.once("close", (code) => resolveExit(code ?? 1));
  });

  const violations = assertSeoBuildOutput(output);
  for (const label of violations) {
    const violation = VIOLATIONS.find((candidate) => candidate.label === label);
    console.error(`[seo-build] ${label}:\n${matchingBlock(output, violation?.pattern ?? /$^/)}\n`);
  }

  if (exitCode !== 0) return exitCode;
  return violations.length === 0 ? 0 : 1;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await runBuild();
}
