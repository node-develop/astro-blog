import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_PALETTE,
  buildInlineConfig,
  buildUiConfig,
  themeFromRoot,
} from "~/lib/booking/config";

describe("booking config", () => {
  it("reads the site theme from <html data-theme>, light unless explicitly dark", () => {
    expect(themeFromRoot("dark")).toBe("dark");
    expect(themeFromRoot(null)).toBe("light");
    expect(themeFromRoot("light")).toBe("light");
    expect(themeFromRoot("sepia")).toBe("light");
  });

  it("passes the current theme to both the iframe URL and the ui instruction", () => {
    expect(buildInlineConfig("dark")).toMatchObject({ theme: "dark", layout: "month_view" });
    expect(buildInlineConfig("light").theme).toBe("light");
    expect(buildUiConfig("dark").theme).toBe("dark");
    expect(buildUiConfig("light").theme).toBe("light");
  });

  it("brands the booker per theme with the palette, whatever theme is active", () => {
    for (const active of ["light", "dark"] as const) {
      const vars = buildUiConfig(active).cssVarsPerTheme;
      expect(vars.light["cal-brand"]).toBe(BRAND_PALETTE.light.brand);
      expect(vars.light["cal-brand-text"]).toBe(BRAND_PALETTE.light.brandText);
      expect(vars.dark["cal-brand"]).toBe(BRAND_PALETTE.dark.brand);
      expect(vars.dark["cal-brand-text"]).toBe(BRAND_PALETTE.dark.brandText);
    }
  });

  it("mirrors the accent tokens, because the cross-origin iframe cannot read CSS variables", () => {
    const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
    const darkStart = tokens.indexOf(':root[data-theme="dark"]');
    expect(darkStart).toBeGreaterThan(-1);
    const accentIn = (css: string): string | undefined =>
      css.match(/--color-accent:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase();

    expect(accentIn(tokens.slice(0, darkStart))).toBe(BRAND_PALETTE.light.brand);
    expect(accentIn(tokens.slice(darkStart))).toBe(BRAND_PALETTE.dark.brand);
  });
});
