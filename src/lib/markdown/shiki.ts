import type { ShikiConfig } from "astro";

// CSS selects both palettes using the site's data-theme, without inline colors.
export const shikiThemes: ShikiConfig = {
  themes: {
    light: "github-light-high-contrast",
    dark: "github-dark-high-contrast",
  },
  defaultColor: false,
  wrap: false,
};
