// Single source of truth for the site author identity. Edit this file when the
// owner's role/profile changes or when adding additional sameAs URLs.
//
// Profile pulled from CV (2026-05) — primary role is AI engineering and backend,
// not Astro. Astro is just the framework powering this blog. Don't add it to
// jobTitle/description/knowsAbout for SEO purposes.

export interface NotableWorkItem {
  readonly title: string;
  readonly url: string;
  readonly description: string;
}

export interface PersonProfile {
  readonly name: string;
  readonly alternateName: string;
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
  name: "Artyom Kashuta",
  alternateName: "Артём Кашута",
  url: `${SITE}/about`,
  image: `${SITE}/avatar-512.png`,
  jobTitle: "Full-stack & AI engineer · LLM/agent workflows · backend",
  description:
    "Full-stack and AI engineer with 5+ years shipping production systems — APIs, data pipelines, LLM/agent workflows, and cloud infra. Daily user of Claude Code and Cursor; ships with OpenAI, Anthropic, and Gemini APIs, LangGraph, LangChain, and LangSmith.",
  knowsAbout: [
    "Claude Code",
    "AI agent engineering",
    "LangGraph",
    "LangChain",
    "LangSmith",
    "OpenAI API",
    "Anthropic API",
    "Gemini API",
    "RAG",
    "Embeddings",
    "Vector search",
    "Hybrid search",
    "Python",
    "FastAPI",
    "TypeScript",
    "Node.js",
    "Fastify",
    "gRPC",
    "Apache Kafka",
    "PostgreSQL",
    "Redis",
    "AWS EKS",
    "Kubernetes",
    "OpenTelemetry",
    "Distributed systems",
    "Backend architecture",
  ],
  sameAs: [
    "https://github.com/node-develop",
    "https://www.linkedin.com/in/artem-kashuta/",
    "https://x.com/artkadev",
    "https://t.me/akv6020",
  ],
  email: "a@artka.dev",

  notableWork: [
    {
      title: "Claude Code Guide (RU, 14 lessons)",
      url: `${SITE}/courses/claude-code-guide`,
      description:
        "A 14-lesson series on Claude Code internals — harness, agent loop, context, skills, hooks, MCP, subagents, models, and antipatterns.",
    },
    {
      title: "artka.dev — personal blog",
      url: SITE,
      description:
        "Notes on AI agent engineering, Claude Code, LLM pipelines, and production backend in Russian and English.",
    },
  ],
  yearsExperience: 5,
  techStack: [
    "Python",
    "TypeScript",
    "Node.js",
    "FastAPI",
    "Fastify",
    "PostgreSQL",
    "Redis",
    "Apache Kafka",
    "gRPC",
    "GraphQL",
    "AWS EKS",
    "Kubernetes",
    "Docker",
    "GitHub Actions",
    "GitLab CI/CD",
    "OpenTelemetry",
    "Prometheus",
    "Grafana",
    "Claude Code",
    "Cursor",
    "Anthropic SDK",
    "OpenAI SDK",
    "LangGraph",
    "LangChain",
    "LangSmith",
  ],
  expertiseAreas: [
    "AI agent engineering",
    "LLM evaluation & tracing",
    "Backend & distributed systems",
    "Event-sourced microservices",
    "Observability & SRE",
  ],
};
