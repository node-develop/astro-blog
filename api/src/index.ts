import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "api", version: process.env.GIT_SHA ?? "dev" }),
);

app.get("/", (c) => c.text("artka-api stub. See /health"));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`api listening on :${port}`);
