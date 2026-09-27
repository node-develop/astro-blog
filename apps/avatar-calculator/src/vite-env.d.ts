/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (G-XXXXXXX). Analytics stays off when unset. */
  readonly VITE_GA_ID?: string;
}
