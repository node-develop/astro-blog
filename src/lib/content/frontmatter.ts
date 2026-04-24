import yaml from "js-yaml";

export interface Frontmatter {
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly cover?: string;
  readonly coverAlt?: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = FENCE.exec(raw);
  if (!match || match[1] === undefined) {
    throw new Error("No frontmatter block found at top of file");
  }
  const yamlText = match[1];
  const body = raw.slice(match[0].length).replace(/^\s*\n/, "");

  const parsed = yaml.load(yamlText) as Record<string, unknown>;
  const result: Frontmatter = {
    title: String(parsed["title"] ?? ""),
    description: String(parsed["description"] ?? ""),
    pubDate: coerceDate(parsed["pubDate"]),
    tags: Array.isArray(parsed["tags"]) ? parsed["tags"].map(String) : [],
    draft: Boolean(parsed["draft"] ?? false),
    ...(parsed["updatedDate"] !== undefined
      ? { updatedDate: coerceDate(parsed["updatedDate"]) }
      : {}),
    ...(typeof parsed["cover"] === "string" ? { cover: parsed["cover"] } : {}),
    ...(typeof parsed["coverAlt"] === "string" ? { coverAlt: parsed["coverAlt"] } : {}),
  };
  return { frontmatter: result, body };
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const rawYml = yaml.dump(
    {
      title: fm.title,
      description: fm.description,
      pubDate: toIsoDate(fm.pubDate),
      ...(fm.updatedDate ? { updatedDate: toIsoDate(fm.updatedDate) } : {}),
      tags: fm.tags,
      draft: fm.draft,
      ...(fm.cover ? { cover: fm.cover } : {}),
      ...(fm.coverAlt ? { coverAlt: fm.coverAlt } : {}),
    },
    { lineWidth: 120 },
  );
  // js-yaml quotes date-like strings (YYYY-MM-DD) to avoid ambiguity with YAML date scalars.
  // Strip those quotes so the output is human-friendly and round-trips cleanly.
  const yml = rawYml.replace(/(['"])(\d{4}-\d{2}-\d{2})\1/g, "$2");
  return `---\n${yml}---\n\n${body}`;
}

function coerceDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid pubDate: ${value}`);
    return d;
  }
  throw new Error(`invalid pubDate: ${value}`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
