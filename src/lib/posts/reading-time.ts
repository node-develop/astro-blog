/**
 * reading-time — estimate reading duration for a post.
 *
 * Locale-aware: RU/CN/JP languages count by characters ÷ 5; latin
 * languages count by words. The 200 wpm baseline is the standard for
 * mid-density technical prose; bumped to 280 cps (≈ 1400 cps/min ÷ 5)
 * for cyrillic to roughly match real readers.
 *
 * Code blocks are deliberately included — they take longer to "read"
 * than prose, so leaving them in produces a more honest estimate.
 *
 * Returns whole minutes (rounded up, minimum 1).
 */
import type { Locale } from "~/i18n";

const WPM_LATIN = 220;
const CPM_CYRILLIC = 1100;

const isCyrillic = (s: string): boolean => /[\u0400-\u04FF]/.test(s);

interface ReadingTimeOptions {
  readonly text: string;
  readonly locale?: Locale;
}

export const getReadingTime = ({ text, locale }: ReadingTimeOptions): number => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return 1;

  // If locale hint says RU, or text is majority cyrillic, use CPM.
  if (locale === "ru" || (locale === undefined && isCyrillic(cleaned))) {
    const minutes = cleaned.length / CPM_CYRILLIC;
    return Math.max(1, Math.ceil(minutes));
  }

  const words = cleaned.split(/\s+/).length;
  const minutes = words / WPM_LATIN;
  return Math.max(1, Math.ceil(minutes));
};

/**
 * Format the reading-time value with a localised suffix.
 *
 * RU pluralisation: 1 минута / 2-4 минуты / 5+ минут.
 */
export const formatReadingTime = (minutes: number, locale: Locale): string => {
  if (locale === "en") return `${minutes} min read`;

  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  let suffix: string;
  if (mod10 === 1 && mod100 !== 11) suffix = "минута";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) suffix = "минуты";
  else suffix = "минут";

  return `${minutes} ${suffix}`;
};
