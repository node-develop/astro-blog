// Single source of truth for the site author identity. Edit this file when the
// owner provides additional sameAs URLs or a square avatar (>= 512x512 PNG).
// Plan 2 added: notableWork, yearsExperience, techStack, expertiseAreas — kept in
// sync with markdown copy under src/content/site/.

export interface NotableWorkItem {
  readonly title: string;
  readonly url: string;
  readonly description: string;
}

export interface PersonProfile {
  readonly name: string;
  readonly url: string;
  readonly image: string;
  readonly jobTitle: string;
  readonly description: string;
  readonly knowsAbout: ReadonlyArray<string>;
  readonly sameAs: ReadonlyArray<string>;
  readonly email: string;
  readonly notableWork: ReadonlyArray<NotableWorkItem>;
  readonly yearsExperience: number;
  readonly techStack: ReadonlyArray<string>;
  readonly expertiseAreas: ReadonlyArray<string>;
}

const SITE = "https://artka.dev";

export const person: PersonProfile = {
  name: "Артём Кашута",
  url: `${SITE}/about`,
  // TODO(owner): replace with a square ≥ 512×512 PNG (spec open-question #5).
  image: `${SITE}/og-default.svg`,
  jobTitle: "Software engineer · backend & AI agent engineering",
  description:
    "Backend инженер и AI-agent engineer. Пишу про Claude Code, harness/agent loop, Astro/Node.js и распределённые системы.",
  knowsAbout: [
    "Claude Code",
    "AI agent engineering",
    "Node.js",
    "TypeScript",
    "Astro",
    "Distributed systems",
    "DevOps",
  ],
  // TODO(owner): add LinkedIn / GitHub / X URLs (spec open-question #2).
  sameAs: [],
  email: "a@artka.dev",

  notableWork: [
    {
      title: "Claude Code Guide (RU, 14 частей)",
      url: `${SITE}/blog`,
      description:
        "Серия про harness/agent loop, context, skills, hooks, MCP, subagents и антипаттерны Claude Code.",
    },
    {
      title: "artka.dev — этот блог",
      url: SITE,
      description: "Astro 5 + Postgres + Drizzle, билингв RU/EN, SSG-острова под админку.",
    },
    {
      title: "AI agent engineering writeups",
      url: `${SITE}/blog`,
      description:
        "Постмортемы и разборы агентских систем: tool design, evaluation, harness и production failure modes.",
    },
  ],
  yearsExperience: 10,
  techStack: [
    "TypeScript",
    "Node.js",
    "Astro",
    "PostgreSQL",
    "Drizzle ORM",
    "Docker",
    "GitHub Actions",
    "Claude Code",
    "Anthropic SDK",
  ],
  expertiseAreas: [
    "AI agent engineering",
    "Backend & distributed systems",
    "Developer tooling",
    "DevOps & deploy automation",
  ],
};
