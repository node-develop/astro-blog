import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import remarkMath from "remark-math";
import remarkStripFrontmatterDuplicates from "./src/lib/remark/strip-frontmatter-duplicates";
import remarkStripMdSuffix from "./src/lib/remark/strip-md-suffix";
import canonicalInternalLinks from "./src/lib/rehype/canonical-internal-links";
import lazyContentImages from "./src/lib/rehype/lazy-content-images";
import focusableTables from "./src/lib/rehype/focusable-tables";
import rehypeExternalLinks, { type Options as ExternalLinksOptions } from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeMermaid from "rehype-mermaid";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCodeTitles from "rehype-code-titles";
import { autolinkOptions } from "./src/lib/markdown/autolink";
import { externalLinkPolicy } from "./src/lib/markdown/external-links";
import { shikiThemes } from "./src/lib/markdown/shiki";
import { buildLegacyRedirects } from "./src/lib/seo/redirects";
import { CANONICAL_ORIGIN } from "./src/lib/seo/url-policy";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// Structural Vite plugin type. We avoid importing from `vite` directly
// because it is not a top-level dependency — only Astro pulls it in
// transitively, which makes `vite`-types unresolvable to `tsc` here.
interface MiddlewareServer {
  readonly middlewares: {
    use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void;
  };
}
interface VitePluginShape {
  readonly name: string;
  readonly apply?: "serve" | "build";
  readonly configureServer?: (server: MiddlewareServer) => void;
}

/**
 * Dev-only Vite middleware that serves Pagefind artifacts at `/pagefind/*`
 * from `dist/client/pagefind/`. Pagefind only writes its bundle during
 * `pnpm build`, so the user must run a build at least once before the
 * ⌘K palette can load in `astro dev`.
 */
const pagefindDevMiddleware = (): VitePluginShape => ({
  name: "astro-blog:pagefind-dev",
  apply: "serve",
  configureServer(server) {
    const root = join(process.cwd(), "dist", "client", "pagefind");
    const MIME: Record<string, string> = {
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".wasm": "application/wasm",
      ".pagefind": "application/octet-stream",
      ".pf_meta": "application/octet-stream",
      ".pf_index": "application/octet-stream",
      ".pf_fragment": "application/octet-stream",
    };
    server.middlewares.use((req, res, next) => {
      if (!req.url || !req.url.startsWith("/pagefind/")) return next();
      const rel = decodeURIComponent(req.url.slice("/pagefind/".length).split("?")[0] ?? "");
      const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
      const file = join(root, safe);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(
          `Pagefind bundle not found at ${file}.\n` +
            `Run \`pnpm build\` once to generate /pagefind/* (then keep \`pnpm dev\` running).`,
        );
        return;
      }
      const ext = file.slice(file.lastIndexOf("."));
      res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-store");
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  site: CANONICAL_ORIGIN,
  trailingSlash: "always",
  output: "static",
  adapter: node({ mode: "standalone" }),
  i18n: {
    defaultLocale: "ru",
    locales: ["ru", "en"],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  redirects: buildLegacyRedirects(),
  // MDX inherits remark/rehype plugins from `markdown.processor` (Astro 7).
  integrations: [mdx(), react()],
  // Astro 7 defaults to the Sätteri pipeline; we depend on the remark/rehype
  // ecosystem (KaTeX, Mermaid, custom link/heading plugins), so we keep unified().
  markdown: {
    processor: unified({
      remarkPlugins: [remarkStripFrontmatterDuplicates, remarkMath, remarkStripMdSuffix],
      rehypePlugins: [
        canonicalInternalLinks,
        rehypeSlug,
        [rehypeAutolinkHeadings, autolinkOptions],
        // SEO: outbound links get rel="nofollow noopener noreferrer" + target="_blank".
        // Internal links (artka.dev, /, #, mailto:, tel:) are left untouched.
        [rehypeExternalLinks, externalLinkPolicy satisfies ExternalLinksOptions],
        rehypeCodeTitles,
        rehypeKatex,
        [rehypeMermaid, { strategy: "img-svg", dark: true }],
        lazyContentImages,
        // a11y: scrollable tables must be keyboard-reachable (WCAG 2.1.1).
        focusableTables,
      ],
    }),
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid", "math"],
    },
    shikiConfig: shikiThemes,
  },
  // Astro 7 changed the default to "jsx" (strips inter-element whitespace);
  // keep HTML semantics so inline `<a> <span>` runs render with spaces.
  compressHTML: true,
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss(), pagefindDevMiddleware()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
});
