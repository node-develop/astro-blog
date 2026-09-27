/**
 * Google Analytics 4 for the artka.dev property.
 * Skipped on localhost and when the browser sends Do Not Track, same as the
 * blog's Plausible loader. Tracking must never break the calculator, so every
 * call is a no-op until gtag exists.
 */

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** artka.dev GA4 property. Public by design (it ships in every page); VITE_GA_ID overrides it. */
const DEFAULT_GA_ID = "G-X53SL63MK2";
const GA_ID: string | undefined = import.meta.env.VITE_GA_ID || DEFAULT_GA_ID;

const allowed = (): boolean => {
  const host = location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  const dnt = navigator.doNotTrack === "1";
  return Boolean(GA_ID) && !local && !dnt;
};

export const initAnalytics = (): void => {
  if (!allowed() || window.gtag || !GA_ID) return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag must push the `arguments` object itself, not an array copy.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
};

export type AnalyticsEvent =
  | "select_market"
  | "select_mode"
  | "select_level"
  | "apply_niche"
  | "open_niches"
  | "open_economy"
  | "save_scenario"
  | "share"
  | "random_country"
  | "switch_language"
  | "send_feedback"
  | "toggle_ai"
  | "toggle_afford";

export const track = (
  event: AnalyticsEvent,
  params: Readonly<Record<string, string | number | boolean>> = {},
): void => {
  window.gtag?.("event", event, params);
};
