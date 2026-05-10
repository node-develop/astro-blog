import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import remarkMath from "remark-math";
import remarkStripFrontmatterDuplicates from "./src/lib/remark/strip-frontmatter-duplicates";
import remarkStripMdSuffix from "./src/lib/remark/strip-md-suffix";
import rehypeExternalLinks, { type Options as ExternalLinksOptions } from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeMermaid from "rehype-mermaid";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCodeTitles from "rehype-code-titles";
import { autolinkOptions } from "./src/lib/markdown/autolink";
import { externalLinkPolicy } from "./src/lib/markdown/external-links";
import { shikiThemes } from "./src/lib/markdown/shiki";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const SITE_URL = process.env.SITE_URL ?? "https://artka.dev";

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
  site: SITE_URL,
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
  // Permanent redirects (Astro emits 301s + a static fallback at build).
  //
  // Three families:
  //
  //   1. /blog/<slug>(/) → /courses/claude-code-guide/<slug>
  //      The claude-code-guide series previously lived under /blog/ before
  //      the course-lesson layout existed. We list both with and without
  //      trailing slash because Astro's `redirects` matches keys exactly,
  //      and Search Console reported the slash-suffixed variants as 404.
  //
  //   2. Removed posts → /blog
  //      A handful of older drafts (igaming-architecture, event-sourcing-kafka,
  //      scaling-node-microservices) were unpublished. Send their URLs back
  //      to the blog index instead of returning 404.
  //
  //   3. Misc legacy roots → closest live page
  //      One-off paths surfaced in Search Console (`/02-context-and-cache`
  //      from a pre-/blog era, `/igaming`, `/privacy`) that have no modern
  //      counterpart. Redirect to the closest live page rather than 404.
  redirects: (() => {
    const courseSlugs = [
      "01-introduction",
      "02-context-and-cache",
      "03-claude-md",
      "04-skills",
      "05-hooks",
      "06-mcp",
      "07-plugins",
      "08-tool-calls-and-loop",
      "09-subagents",
      "10-agent-teams",
      "11-models-and-pricing",
      "12-travel-agent-blueprint",
      "13-best-practices",
      "14-claims-verification",
    ];
    const removedPosts = [
      "igaming-architecture",
      "event-sourcing-kafka",
      "scaling-node-microservices",
    ];
    const blogToCourseRu = courseSlugs.flatMap((slug) => [
      [`/blog/${slug}`, `/courses/claude-code-guide/${slug}`],
      [`/blog/${slug}/`, `/courses/claude-code-guide/${slug}`],
    ]);
    const blogToCourseEn = courseSlugs.flatMap((slug) => [
      [`/en/blog/${slug}`, `/en/courses/claude-code-guide/${slug}`],
      [`/en/blog/${slug}/`, `/en/courses/claude-code-guide/${slug}`],
    ]);
    const removedPostsRedirects = removedPosts.flatMap((slug) => [
      [`/blog/${slug}`, "/blog"],
      [`/blog/${slug}/`, "/blog"],
      [`/en/blog/${slug}`, "/en/blog"],
      [`/en/blog/${slug}/`, "/en/blog"],
    ]);
    const legacyMisc: ReadonlyArray<[string, string]> = [
      ["/02-context-and-cache", "/courses/claude-code-guide/02-context-and-cache"],
      ["/02-context-and-cache/", "/courses/claude-code-guide/02-context-and-cache"],
      ["/igaming", "/"],
      ["/igaming/", "/"],
      ["/privacy", "/"],
      ["/privacy/", "/"],
    ];
    return Object.fromEntries([
      ...blogToCourseRu,
      ...blogToCourseEn,
      ...removedPostsRedirects,
      ...legacyMisc,
    ]);
  })(),
  integrations: [
    mdx({
      remarkPlugins: [remarkStripFrontmatterDuplicates, remarkMath, remarkStripMdSuffix],
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, autolinkOptions],
        // SEO: outbound links get rel="nofollow noopener noreferrer" + target="_blank".
        // Internal links (artka.dev, /, #, mailto:, tel:) are left untouched.
        [rehypeExternalLinks, externalLinkPolicy satisfies ExternalLinksOptions],
        rehypeCodeTitles,
        rehypeKatex,
        [rehypeMermaid, { strategy: "img-svg", dark: true }],
      ],
    }),
    react(),
  ],
  markdown: {
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid", "math"],
    },
    shikiConfig: shikiThemes,
    remarkPlugins: [remarkStripFrontmatterDuplicates, remarkMath, remarkStripMdSuffix],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, autolinkOptions],
      [rehypeExternalLinks, externalLinkPolicy satisfies ExternalLinksOptions],
      rehypeCodeTitles,
      rehypeKatex,
      [rehypeMermaid, { strategy: "img-svg", dark: true }],
    ],
  },
  vite: {
    plugins: [tailwindcss(), pagefindDevMiddleware()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
});
