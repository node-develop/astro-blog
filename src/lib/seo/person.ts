// Single source of truth for the site author identity. Edit this file when the
// owner provides additional sameAs URLs or a square avatar (>= 512x512 PNG).

export interface PersonProfile {
  readonly name: string;
  readonly url: string;
  readonly image: string;
  readonly jobTitle: string;
  readonly description: string;
  readonly knowsAbout: ReadonlyArray<string>;
  readonly sameAs: ReadonlyArray<string>;
  readonly email: string;
}

const SITE = "https://artka.dev";

export const person: PersonProfile = {
  name: "Артём Кашута",
  url: `${SITE}/about`,
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
  sameAs: [],
  email: "a@artka.dev",
};
