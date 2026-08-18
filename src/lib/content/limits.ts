export const POST_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 200 },
  summary: { min: 60, max: 280 },
  faqQuestion: { min: 5, max: 200 },
  faqAnswer: { min: 20, max: 2000 },
} as const;

export const PROJECT_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 200 },
  role: { min: 2, max: 80 },
} as const;

export const SITE_LIMITS = {
  description: { min: 10, max: 200 },
} as const;
