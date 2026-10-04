export const POST_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 200 },
  summary: { min: 60, max: 280 },
  faqQuestion: { min: 5, max: 200 },
  faqAnswer: { min: 20, max: 2000 },
} as const;

/** Thresholds of the Content API editorial gates (src/lib/content-api/editorial.ts). */
export const EDITORIAL_LIMITS = {
  minWords: 1200,
  minSources: 3,
  minInternalLinks: 2,
  minCoverWidth: 1200,
} as const;

export const PROJECT_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 200 },
  role: { min: 2, max: 80 },
} as const;

export const SITE_LIMITS = {
  description: { min: 10, max: 200 },
} as const;
