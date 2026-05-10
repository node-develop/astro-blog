import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "render" }));

const port = Number(process.env.PORT ?? 3002);
serve({ fetch: app.fetch, port });
console.log(`render listening on :${port}`);
