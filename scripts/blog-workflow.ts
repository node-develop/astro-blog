/** Read-only CLI. No article writes, publication, remote checks or model calls. */
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  blogDigest,
  checkBlogWorkflow,
  safeRepositoryPath,
  type BlogFile,
} from "../src/lib/blog-workflow";

const usage =
  "Usage: pnpm exec tsx scripts/blog-workflow.ts <digest|check> <ru.md|mdx> --en <en.md|mdx> [--evidence evidence.json] [--root repository]\n";

const insideRoot = (root: string, target: string): boolean => {
  const within = relative(root, target);
  return (
    Boolean(within) && within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within)
  );
};

const readInput = (root: string, path: string): string => {
  const target = realpathSync(resolve(root, path));
  if (!insideRoot(root, target)) throw new Error("Input resolves outside the permitted --root");
  const info = statSync(target);
  if (!info.isFile()) throw new Error("Input must be a regular file");
  if (info.size > 2 * 1024 * 1024) throw new Error("Input exceeds the 2 MiB limit");
  const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > 2 * 1024 * 1024)
      throw new Error("Input changed or exceeds the 2 MiB regular-file limit");
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
};

const readPost = (root: string, path: string): BlogFile => {
  const extension = extname(path);
  if (extension !== ".md" && extension !== ".mdx")
    throw new Error("Articles must be .md or .mdx files");
  return {
    slug: basename(path, extension),
    format: extension === ".md" ? "md" : "mdx",
    raw: readInput(root, path),
  };
};

const main = (): void => {
  const [command, ruPath, ...args] = process.argv.slice(2);
  if ((command !== "digest" && command !== "check") || !ruPath || ruPath.startsWith("--"))
    throw new Error(usage.trim());
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (
      !flag ||
      !["--en", "--evidence", "--root"].includes(flag) ||
      !value ||
      value.startsWith("--") ||
      options.has(flag)
    )
      throw new Error(`Invalid, incomplete or repeated option: ${flag ?? ""}`);
    options.set(flag, value);
  }
  const root = realpathSync(resolve(options.get("--root") ?? process.cwd()));
  if (!statSync(root).isDirectory()) throw new Error("--root must be a directory");
  const enPath = options.get("--en");
  const ru = readPost(root, ruPath);
  const en = enPath ? readPost(root, enPath) : undefined;
  if (command === "digest") {
    process.stdout.write(`${JSON.stringify(blogDigest(ru, en), null, 2)}\n`);
    return;
  }
  const fileExists = (path: string): boolean => {
    if (!safeRepositoryPath(path)) return false;
    try {
      const target = realpathSync(resolve(root, path));
      if (!insideRoot(root, target)) return false;
      return statSync(target).isFile();
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
      throw error;
    }
  };
  const evidencePath = options.get("--evidence");
  const parseEvidence = (): unknown => {
    const raw = readInput(root, evidencePath!);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error("Evidence is not valid JSON; inspect the local file");
    }
  };
  const report = checkBlogWorkflow({
    ru,
    asOf: new Date().toISOString().slice(0, 10),
    ...(en ? { en } : {}),
    ...(evidencePath ? { evidence: parseEvidence() } : {}),
    fileExists,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.readyForHandoff ? 0 : 1;
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
