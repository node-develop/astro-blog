import type { ShikiConfig } from "astro";

type ShikiTransformer = NonNullable<ShikiConfig["transformers"]>[number];

// The light theme paints comments #66707B. That passes AA on GitHub's white,
// but code blocks here sit on the warm --color-bg-subtle, where it measures
// 3.80:1. #57606A keeps the same muted grey and reaches 4.82:1. Nothing
// noticed for months because no checked page had a comment inside a code
// block; tests/unit/seo/code-theme-rendering.test.ts measures every token.
// A transformer, not `colorReplacements`: Astro does not forward that option.
const LIGHT_COMMENT = /(--shiki-light:)#66707b/i;
const ACCESSIBLE_LIGHT_COMMENT = "#57606A";

const accessibleLightComments: ShikiTransformer = {
  name: "accessible-light-comments",
  span: (node) => {
    const style = node.properties["style"];
    if (typeof style === "string" && LIGHT_COMMENT.test(style)) {
      node.properties["style"] = style.replace(LIGHT_COMMENT, `$1${ACCESSIBLE_LIGHT_COMMENT}`);
    }
  },
};

// CSS selects both palettes using the site's data-theme, without inline colors.
export const shikiThemes: ShikiConfig = {
  themes: {
    light: "github-light-high-contrast",
    dark: "github-dark-high-contrast",
  },
  defaultColor: false,
  wrap: false,
  transformers: [accessibleLightComments],
};
