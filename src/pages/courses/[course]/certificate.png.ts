/**
 * GET /courses/<slug>/certificate.png
 *
 * On-demand certificate generator. Renders a PNG via Satori + Resvg
 * (same dependency stack as the OG images) when a signed-in user has 100%
 * progress on the course. Anonymous users get 401.
 *
 * Querystring: none. Slug comes from the route param.
 *
 * Output: image/png, 1600 × 1100, suitable for download / print at A4.
 *
 * Fonts come from `src/assets/og-fonts/` — the same four files the OG
 * renderer reads. Unlike every OG caller this route is `prerender = false`,
 * so those files DO have to exist in the runtime image; the Dockerfile
 * copies that directory for exactly this endpoint.
 *
 * Fontsource ships one file per subset and satori needs the binary, so each
 * family is registered twice (latin + cyrillic) and referenced as a
 * `fontFamily` list. Satori walks that list per glyph, which is what keeps a
 * Russian recipient name or course title from rendering as tofu.
 */
import type { APIRoute } from "astro";
import { getCollection, getEntry } from "astro:content";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionEntry } from "astro:content";
import { listProgressForUserAndCourse } from "~/lib/db/repo/course-progress";

export const prerender = false;

const W = 1600;
const H = 1100;

interface FontBuffers {
  readonly displayLatin: Buffer;
  readonly displayCyrillic: Buffer;
  readonly textLatin: Buffer;
  readonly textCyrillic: Buffer;
}

let fontCache: FontBuffers | null = null;

const loadFonts = async (): Promise<FontBuffers> => {
  if (fontCache) return fontCache;
  const dir = path.resolve("src/assets/og-fonts");
  fontCache = {
    displayLatin: await readFile(path.join(dir, "Unbounded-ExtraBold.ttf")),
    displayCyrillic: await readFile(path.join(dir, "Unbounded-ExtraBold-Cyrillic.ttf")),
    textLatin: await readFile(path.join(dir, "GolosText-Medium.ttf")),
    textCyrillic: await readFile(path.join(dir, "GolosText-Medium-Cyrillic.ttf")),
  };
  return fontCache;
};

// Poster palette — keep in sync with tokens.css. Satori cannot read custom
// properties, so these are the only hard-coded colours here. A certificate
// gets printed, so it is always the paper theme: ink on paper, one lime mark.
const COLORS = {
  paper: "#f3f1ea",
  ink: "#0b0b0b",
  inkMuted: "rgba(11, 11, 11, 0.64)",
  fill: "#c2f000",
} as const;

/** Both subsets of each family, in fallback order. Spelled the same way
 * as in `~/lib/og/og-image.ts`, and not the foundry way, for the reason
 * documented there. */
const DISPLAY_FAMILY = "Unbounded, Unbounded-Cyr";
const TEXT_FAMILY = "GolosText, GolosText-Cyr";

/**
 * Satori implements no line-clamp and no auto-fit. The recipient name is
 * user-supplied and the course title is editor-supplied, so both step down
 * with character count rather than running off the sheet.
 */
const nameSize = (name: string): number => {
  if (name.length <= 18) return 104;
  if (name.length <= 28) return 78;
  if (name.length <= 40) return 58;
  return 44;
};

const titleSize = (title: string): number => {
  if (title.length <= 32) return 56;
  if (title.length <= 56) return 44;
  return 34;
};

const formatDate = (d: Date, locale: "ru" | "en"): string => {
  const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return formatter.format(d);
};

interface CertProps {
  recipientName: string;
  courseTitle: string;
  courseSlug: string;
  issuedAt: Date;
  locale: "ru" | "en";
}

/** A caps label: the label face plus wide tracking is what makes it one. */
const label = (text: string, size = 15): unknown => ({
  type: "div",
  props: {
    style: {
      fontFamily: TEXT_FAMILY,
      fontSize: size,
      letterSpacing: size * 0.14,
      textTransform: "uppercase",
      color: COLORS.inkMuted,
    },
    children: text,
  },
});

export const certificateTree = (props: CertProps): unknown => ({
  type: "div",
  props: {
    style: {
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      backgroundColor: COLORS.paper,
      color: COLORS.ink,
      // The sheet is a framed slab, like every other poster surface.
      border: `18px solid ${COLORS.ink}`,
      padding: 84,
      fontFamily: TEXT_FAMILY,
    },
    children: [
      // Masthead
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 56,
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  fontFamily: DISPLAY_FAMILY,
                  fontSize: 22,
                  letterSpacing: -0.5,
                  textTransform: "uppercase",
                  color: COLORS.ink,
                },
                children: "ARTKA.DEV",
              },
            },
            // The one lime mark on the sheet.
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  backgroundColor: COLORS.fill,
                  color: COLORS.ink,
                  padding: "8px 18px",
                  fontFamily: TEXT_FAMILY,
                  fontSize: 16,
                  letterSpacing: 2.4,
                  textTransform: "uppercase",
                },
                children: props.locale === "ru" ? "СЕРТИФИКАТ" : "CERTIFICATE",
              },
            },
          ],
        },
      },
      // `auto` top and bottom margins centre the citation block between the
      // masthead and the footer, whatever the name and title lengths do to it.
      {
        type: "div",
        props: {
          style: { display: "flex", marginTop: "auto" },
          children: [
            label(props.locale === "ru" ? "Подтверждается, что" : "This is to certify that", 20),
          ],
        },
      },
      // Recipient
      {
        type: "div",
        props: {
          style: {
            fontFamily: DISPLAY_FAMILY,
            fontSize: nameSize(props.recipientName),
            lineHeight: 1.0,
            letterSpacing: -2,
            marginTop: 28,
            marginBottom: 52,
            maxWidth: W - 204,
          },
          children: props.recipientName,
        },
      },
      {
        type: "div",
        props: {
          style: {
            fontFamily: TEXT_FAMILY,
            fontSize: 30,
            lineHeight: 1.3,
            color: COLORS.inkMuted,
            marginBottom: 20,
            maxWidth: W - 204,
          },
          children:
            props.locale === "ru"
              ? "успешно завершил(а) курс"
              : "has successfully completed the course",
        },
      },
      // Course title — sits on a lime slab underline rather than in italics;
      // neither shipped face has a true italic.
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            fontFamily: DISPLAY_FAMILY,
            fontSize: titleSize(props.courseTitle),
            lineHeight: 1.15,
            letterSpacing: -1,
            color: COLORS.ink,
            borderBottom: `6px solid ${COLORS.fill}`,
            paddingBottom: 10,
            // Shrink to the text so the lime rule underlines the title
            // instead of running the width of the sheet.
            alignSelf: "flex-start",
            marginBottom: "auto",
            maxWidth: W - 204,
          },
          children: props.courseTitle,
        },
      },
      // Footer
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontFamily: TEXT_FAMILY,
            fontSize: 18,
            color: COLORS.ink,
            paddingTop: 40,
            borderTop: `4px solid ${COLORS.ink}`,
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 8 },
                children: [
                  label(props.locale === "ru" ? "Выдан" : "Issued", 13),
                  { type: "div", props: { children: formatDate(props.issuedAt, props.locale) } },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "flex-end",
                },
                children: [
                  label(props.locale === "ru" ? "Идентификатор" : "Certificate ID", 13),
                  {
                    type: "div",
                    props: {
                      children: `${props.courseSlug}/${props.issuedAt.getTime().toString(36)}`,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
});

export const GET: APIRoute = async ({ params, locals }) => {
  const courseSlug = params.course;
  if (!courseSlug || typeof courseSlug !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const user = (locals as { user?: { id: string; name?: string | null; email: string } | null })
    .user;
  if (!user) {
    return new Response("Sign in to download your certificate.", { status: 401 });
  }

  const course = await getEntry("course", `${courseSlug}/_index`);
  if (!course) return new Response("Course not found", { status: 404 });

  const lessons = await getCollection("lesson", (l: CollectionEntry<"lesson">) =>
    l.id.startsWith(`${courseSlug}/`),
  );
  const completed = await listProgressForUserAndCourse(user.id, courseSlug);

  if (lessons.length === 0 || completed.length < lessons.length) {
    return new Response("Course not yet complete.", { status: 403 });
  }

  const fonts = await loadFonts();
  const recipientName = user.name?.trim() || user.email.split("@")[0] || "Anonymous";
  const locale = (course.data.locale ?? "ru") as "ru" | "en";

  const svg = await satori(
    certificateTree({
      recipientName,
      courseTitle: course.data.title,
      courseSlug,
      issuedAt: new Date(),
      locale,
    }) as never,
    {
      width: W,
      height: H,
      fonts: [
        { name: "Unbounded", data: fonts.displayLatin, weight: 800, style: "normal" },
        { name: "Unbounded-Cyr", data: fonts.displayCyrillic, weight: 800, style: "normal" },
        { name: "GolosText", data: fonts.textLatin, weight: 500, style: "normal" },
        { name: "GolosText-Cyr", data: fonts.textCyrillic, weight: 500, style: "normal" },
      ],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=0, must-revalidate",
      "content-disposition": `inline; filename="${courseSlug}-certificate.png"`,
    },
  });
};
