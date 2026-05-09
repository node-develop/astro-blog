export type SocialChannel = "x_en" | "li_en" | "tg_ru";
export type GenerationStage = "writer" | "editor" | "critic";

export type Draft = {
  body: string;
  threadTail?: string[]; // only present (and only allowed) for x_en threads
  mediaUrl: string | null;
};

export type CriticNote =
  | { severity: "block"; kind: "fact"; message: string; span?: [number, number] }
  | { severity: "block"; kind: "policy"; message: string; tag?: string }
  | { severity: "warn"; kind: "tone"; message: string; span?: [number, number] }
  | { severity: "warn"; kind: "length"; message: string };

export type Article = {
  collection: "posts";
  slug: string;
  title: string;
  summary: string;
  body: string; // markdown без frontmatter
  tags: readonly string[];
  pubDate: Date;
  cover: { src: string; alt: string } | null;
  lang: "ru" | "en";
  sourceUrl: string; // canonical https://artka.dev/blog/...
  hasEnTwin: boolean; // true if src/content/posts/en/{slug}.md exists
};

export const ALL_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en", "tg_ru"];
export const EN_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en"];
