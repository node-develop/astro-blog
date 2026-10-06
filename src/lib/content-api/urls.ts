export const articleUrl = (slug: string, lang: string): string => {
  const site = new URL(process.env.SITE_URL ?? "https://artka.dev");
  return new URL(`${lang === "en" ? "/en" : ""}/blog/${slug}/`, site).href;
};
