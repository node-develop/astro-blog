import ru from "./strings.ru.json" with { type: "json" };
import en from "./strings.en.json" with { type: "json" };
import tagsRu from "./tags.ru.json" with { type: "json" };
import tagsEn from "./tags.en.json" with { type: "json" };

export type Locale = "ru" | "en";
export type StringKey = keyof typeof ru;

const strings: Record<Locale, Record<string, string>> = { ru, en };
const tags: Record<Locale, Record<string, string>> = { ru: tagsRu, en: tagsEn };

export const t = (locale: Locale, key: StringKey): string =>
  strings[locale][key] ?? strings.ru[key] ?? key;

export const tagLabel = (locale: Locale, slug: string): string =>
  tags[locale][slug] ?? tags.ru[slug] ?? slug;

export const isLocale = (value: unknown): value is Locale => value === "ru" || value === "en";
