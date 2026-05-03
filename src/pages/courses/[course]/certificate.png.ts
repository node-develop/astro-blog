/**
 * GET /courses/<slug>/certificate.png
 *
 * On-demand certificate generator. Renders a PNG via Satori + Resvg
 * (same dependency stack as Phase 3 OG images) when a signed-in user
 * has 100% progress on the course. Anonymous users get 401.
 *
 * Querystring: none. Slug comes from the route param.
 *
 * Output: image/png, 1600 × 1100, suitable for download / print at A4.
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

let serifFontCache: Buffer | null = null;
let monoFontCache: Buffer | null = null;

const loadFonts = async (): Promise<{ serif: Buffer; mono: Buffer }> => {
  if (!serifFontCache) {
    const p = path.resolve("public/fonts/SourceSerif4-Regular.ttf");
    serifFontCache = await readFile(p);
  }
  if (!monoFontCache) {
    const p = path.resolve("public/fonts/JetBrainsMono-Regular.ttf");
    monoFontCache = await readFile(p);
  }
  return { serif: serifFontCache, mono: monoFontCache };
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

const tpl = (props: CertProps): unknown => ({
  type: "div",
  props: {
    style: {
      width: W,
      height: H,
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#FAF8F5",
      color: "#1A1814",
      padding: 96,
      fontFamily: "SourceSerif4",
      position: "relative",
    },
    children: [
      // Top rule
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "JetBrainsMono",
            fontSize: 18,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#7A5A3F",
            marginBottom: 96,
          },
          children: [
            { type: "div", props: { children: "ARTKA.DEV" } },
            {
              type: "div",
              props: {
                children: props.locale === "ru" ? "СЕРТИФИКАТ" : "CERTIFICATE",
              },
            },
          ],
        },
      },
      // Subtitle
      {
        type: "div",
        props: {
          style: {
            fontFamily: "JetBrainsMono",
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#5A4F42",
            marginBottom: 48,
          },
          children: props.locale === "ru" ? "Подтверждается, что" : "This is to certify that",
        },
      },
      // Recipient name
      {
        type: "div",
        props: {
          style: {
            fontSize: 96,
            fontFamily: "SourceSerif4",
            fontWeight: 600,
            lineHeight: 1.05,
            marginBottom: 56,
            maxWidth: W - 192,
          },
          children: props.recipientName,
        },
      },
      // Body line
      {
        type: "div",
        props: {
          style: {
            fontSize: 36,
            fontFamily: "SourceSerif4",
            lineHeight: 1.3,
            color: "#3A342B",
            marginBottom: 28,
            maxWidth: W - 192,
          },
          children:
            props.locale === "ru"
              ? "успешно завершил(а) курс"
              : "has successfully completed the course",
        },
      },
      // Course title
      {
        type: "div",
        props: {
          style: {
            fontSize: 56,
            fontFamily: "SourceSerif4",
            fontWeight: 500,
            fontStyle: "italic",
            lineHeight: 1.15,
            color: "#1A1814",
            marginBottom: "auto",
            maxWidth: W - 192,
          },
          children: props.courseTitle,
        },
      },
      // Bottom row
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontFamily: "JetBrainsMono",
            fontSize: 18,
            color: "#5A4F42",
            paddingTop: 48,
            borderTop: "1px solid #D9D2C5",
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 6 },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { letterSpacing: 2, textTransform: "uppercase", fontSize: 13 },
                      children: props.locale === "ru" ? "ВЫДАН" : "ISSUED",
                    },
                  },
                  { type: "div", props: { children: formatDate(props.issuedAt, props.locale) } },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { letterSpacing: 2, textTransform: "uppercase", fontSize: 13 },
                      children: props.locale === "ru" ? "ИДЕНТИФИКАТОР" : "CERTIFICATE ID",
                    },
                  },
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
    tpl({
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
        { name: "SourceSerif4", data: fonts.serif, weight: 400, style: "normal" },
        { name: "JetBrainsMono", data: fonts.mono, weight: 400, style: "normal" },
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
