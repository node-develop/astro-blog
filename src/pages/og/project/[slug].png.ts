/**
 * Static OG-image route for portfolio projects: one PNG per project per
 * locale at `/og/project/<slug>-<locale>.png` (shape owned by
 * `projectOgPath()` in src/lib/og/project-pages.ts).
 *
 * Locale resolution mirrors the two page routes
 * (`src/pages/projects/[slug].astro` and its `en/` twin): EN twins live
 * under `en/` in the projects collection, RU entries do not.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { renderOg } from "~/lib/og/og-image";
import { bareProjectSlug, projectOgEyebrow, projectOgSlug } from "~/lib/og/project-pages";

type Project = CollectionEntry<"projects">;

export const getStaticPaths: GetStaticPaths = async () => {
  // Every project of both locales — the pages have no draft flag, so what the
  // routes render is exactly what this list contains.
  const projects: ReadonlyArray<Project> = await getCollection("projects");

  const paths: Array<{ params: { slug: string }; props: { title: string; eyebrow: string } }> = [];
  // Same fail-loud guard as the post and lesson routes: a card silently taken
  // over by another project would be shared with the wrong title and the
  // wrong language, and the build would still say it succeeded.
  const claimedBy = new Map<string, string>();

  for (const project of projects) {
    const locale = project.id.startsWith("en/") ? "en" : "ru";
    const slug = projectOgSlug(bareProjectSlug(project.id), locale);

    const clash = claimedBy.get(slug);
    if (clash !== undefined) {
      throw new Error(
        `[og] project image path collision at /og/project/${slug}.png: claimed by both ` +
          `"${clash}" and "${project.id}". Two projects would share one card, so one of them ` +
          `would be shared with the other's title and language. Rename one project file, or ` +
          `change projectOgSlug() in src/lib/og/project-pages.ts to a shape that cannot collide.`,
      );
    }
    claimedBy.set(slug, project.id);

    paths.push({
      params: { slug },
      props: {
        title: project.data.title,
        eyebrow: projectOgEyebrow({ locale, year: project.data.pubDate.getFullYear() }),
      },
    });
  }

  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow: string };
  const png = await renderOg({ title, eyebrow });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
