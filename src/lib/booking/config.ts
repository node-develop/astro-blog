/**
 * Cal.com booking embed — the one place that knows the account, which event
 * each locale books, and how the booker is themed.
 *
 * Everything here is public (it ends up in the page and in the Cal.com URL),
 * so it is code, not env — same reasoning as CANONICAL_ORIGIN.
 *
 * Imported by the server (BookingWidget markup, CSP) and by the client script
 * that mounts the embed, so it must stay free of server-only imports.
 */
import type { Locale } from "~/i18n";

/** Cal.com Cloud, US data region — the region the `kashuta` account lives in. */
export const CAL_ORIGIN = "https://app.cal.com";
export const CAL_EMBED_URL = `${CAL_ORIGIN}/embed/embed.js`;
/** Public booking pages; the no-JS fallback link points here. */
const CAL_PUBLIC_ORIGIN = "https://cal.com";
const CAL_USER = "kashuta";

/** Prefix of the embed namespace; each mount appends a counter. */
export const CAL_NAMESPACE_PREFIX = "book";

/**
 * Event slug per locale; `null` embeds the profile page, where the reader picks
 * one of the account's meetings (30 min or 1 hour). A slug must exist on the
 * account — an unknown one renders Cal.com's "404. Cal Link seems to be wrong"
 * inside the embed. To open straight on one event, put its slug here.
 */
const EVENT_BY_LOCALE: Readonly<Record<Locale, string | null>> = {
  ru: null,
  en: null,
};

export const calLinkFor = (locale: Locale): string => {
  const event = EVENT_BY_LOCALE[locale];
  return event ? `${CAL_USER}/${event}` : CAL_USER;
};

export const calPublicUrl = (locale: Locale): string =>
  `${CAL_PUBLIC_ORIGIN}/${calLinkFor(locale)}`;

/** Plausible custom events. Props never carry the booking uid, name, email or time. */
export const BOOKING_ANALYTICS = {
  booked: "Booking",
  embedFailed: "BookingEmbedFailed",
} as const;

export type BookingTheme = "light" | "dark";

/**
 * Literal copies of `--color-accent` per theme from src/styles/tokens.css
 * (tests/unit/booking/config.test.ts fails when they drift). The booker is a
 * cross-origin iframe, so it cannot read our custom properties.
 *
 * Text on the brand colour: white on ultramarine in light; ink on the lighter
 * dark-theme violet, where white would drop below AA.
 */
export const BRAND_PALETTE: Readonly<
  Record<BookingTheme, Readonly<{ brand: string; brandText: string }>>
> = {
  light: { brand: "#2a1ae0", brandText: "#ffffff" },
  dark: { brand: "#8a7eff", brandText: "#0b0b0b" },
};

/** The site sets `data-theme="dark"` or nothing; anything else reads as light. */
export const themeFromRoot = (attr: string | null): BookingTheme =>
  attr === "dark" ? "dark" : "light";

/** Query-param config for the `inline` instruction (applied before first paint). */
export const buildInlineConfig = (theme: BookingTheme) =>
  ({
    layout: "month_view",
    theme,
    useSlotsViewOnSmallScreen: "true",
  }) as const;

/** Payload for the `ui` instruction; safe to re-send on every theme change. */
export const buildUiConfig = (theme: BookingTheme) =>
  ({
    theme,
    layout: "month_view",
    hideEventTypeDetails: false,
    cssVarsPerTheme: {
      light: {
        "cal-brand": BRAND_PALETTE.light.brand,
        "cal-brand-text": BRAND_PALETTE.light.brandText,
      },
      dark: {
        "cal-brand": BRAND_PALETTE.dark.brand,
        "cal-brand-text": BRAND_PALETTE.dark.brandText,
      },
    },
  }) as const;
