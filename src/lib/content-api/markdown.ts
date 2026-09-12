import { format } from "prettier";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import { z } from "zod";
import * as yaml from "~/lib/yaml";
import type { ArticleDocument } from "./contract";
import { apiError } from "./errors";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkStringify);
export const safeLink = (url: string): boolean =>
  /^https:\/\//i.test(url) || /^\/(?!\/)[a-z0-9/_.#?=&%-]*$/i.test(url) || /^#[\w-]+$/.test(url);

export const inspectMarkdown = (body: string, assets?: ReadonlyMap<string, string>) => {
  if (/^\uFEFF?\s*---\s*\r?\n/.test(body))
    throw apiError(
      422,
      "invalid_markdown",
      "Send metadata in article fields, not YAML frontmatter.",
    );
  const tree = processor.parse(body);
  const ids = new Set<string>();
  visit(tree, (node) => {
    if (node.type === "html")
      throw apiError(422, "unsafe_markdown", "Raw HTML and MDX are not supported.");
    if (node.type === "heading" && node.depth === 1)
      throw apiError(422, "duplicate_h1", "Use H2/H3 in body; title supplies the H1.");
    if (node.type === "imageReference")
      throw apiError(422, "invalid_image", "Use inline images: ![alt](asset:UUID).");
    if (node.type === "image") {
      const id = node.url.replace(/^asset:/, "");
      if (!node.url.startsWith("asset:") || !z.uuid().safeParse(id).success || !node.alt?.trim())
        throw apiError(422, "invalid_image", "Images require alt text and an asset:UUID URL.");
      ids.add(id);
      if (assets) {
        const url = assets.get(id);
        if (!url)
          throw apiError(422, "missing_asset", "Upload the referenced image first.", {
            assetId: id,
          });
        node.url = url;
      }
    }
    if ((node.type === "link" || node.type === "definition") && !safeLink(node.url))
      throw apiError(422, "unsafe_link", "Links must use HTTPS, a site path, or a heading anchor.");
  });
  return { assetIds: [...ids], body: String(processor.stringify(tree)) };
};

export interface RenderAsset {
  id: string;
  url: string;
  width: number;
  height: number;
}
export const serializeArticle = async (
  document: ArticleDocument,
  assets: readonly RenderAsset[],
  revision: string,
  publishedAt: Date,
  updatedAt?: Date,
): Promise<string> => {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const cover = document.cover && byId.get(document.cover.assetId);
  const social = document.socialImage ? byId.get(document.socialImage.assetId) : cover;
  const { body } = inspectMarkdown(document.body, new Map(assets.map((a) => [a.id, a.url])));
  const frontmatter = {
    title: document.title,
    description: document.description,
    summary: document.summary,
    pubDate: publishedAt.toISOString(),
    ...(updatedAt ? { updatedDate: updatedAt.toISOString() } : {}),
    lang: document.lang,
    draft: false,
    tags: document.tags,
    keywords: document.keywords,
    faq: document.faq,
    apiRevision: revision,
    ...(document.seo?.title ? { seoTitle: document.seo.title } : {}),
    ...(document.seo?.description ? { seoDescription: document.seo.description } : {}),
    ...(cover
      ? { cover: cover.url, coverAlt: document.cover!.alt, coverCaption: document.cover!.caption }
      : {}),
    ...(social
      ? {
          socialImage: social.url,
          socialImageAlt: (document.socialImage ?? document.cover)!.alt,
          socialImageWidth: social.width,
          socialImageHeight: social.height,
        }
      : {}),
  };
  // Stringify appended links through the Markdown AST so titles cannot inject markup.
  const sources = processor.stringify({
    type: "root",
    children: [
      {
        type: "heading",
        depth: 2,
        children: [{ type: "text", value: document.lang === "ru" ? "Источники" : "Sources" }],
      },
      {
        type: "list",
        ordered: false,
        spread: false,
        children: document.sources.map((s) => ({
          type: "listItem",
          spread: false,
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "link",
                  url: s.url,
                  children: [{ type: "text", value: s.title }],
                },
              ],
            },
          ],
        })),
      },
    ],
  });
  const related = document.relatedSlugs.length
    ? "\n\n" +
      processor.stringify({
        type: "root",
        children: [
          {
            type: "heading",
            depth: 2,
            children: [
              {
                type: "text",
                value: document.lang === "ru" ? "Читайте также" : "Related articles",
              },
            ],
          },
          {
            type: "list",
            ordered: false,
            spread: false,
            children: document.relatedSlugs.map((slug) => ({
              type: "listItem",
              spread: false,
              children: [
                {
                  type: "paragraph",
                  children: [
                    {
                      type: "link",
                      url: `${document.lang === "en" ? "/en" : ""}/blog/${slug}/`,
                      children: [{ type: "text", value: slug }],
                    },
                  ],
                },
              ],
            })),
          },
        ],
      })
    : "";
  return format(
    `---\n${yaml.dump(frontmatter, { lineWidth: 120, skipInvalid: true })}---\n\n${body}\n${sources}${related}`,
    {
      parser: "markdown",
      printWidth: 100,
    },
  );
};
