import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const CourseLevel = z.enum(["beginner", "intermediate", "advanced"]);
const CourseStatus = z.enum(["published", "draft", "in-progress"]);

export const courses = defineCollection({
  loader: glob({ pattern: "**/_index.{md,mdx}", base: "./src/content/courses" }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    level: CourseLevel.default("intermediate"),
    status: CourseStatus.default("published"),
    duration: z.string().optional(),
    locale: z.enum(["ru", "en"]).default("ru"),
    cover: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export const lessons = defineCollection({
  loader: glob({
    pattern: ["**/*.{md,mdx}", "!**/_index.{md,mdx}"],
    base: "./src/content/courses",
  }),
  schema: z.object({
    title: z.string(),
    blurb: z.string().optional(),
    duration: z.coerce.number().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    order: z.number().optional(),
    locale: z.enum(["ru", "en"]).default("ru"),
  }),
});
