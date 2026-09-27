// Minimal static server for Railway. No dependencies: serves dist/ with
// long cache for hashed assets and no-cache for index.html. Answers on /
// and on /avatar-calculator/ so the later artka.dev mount needs no rebuild.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = join(import.meta.dirname, "dist");
const PORT = Number(process.env.PORT ?? 8080);
const PREFIX = "/avatar-calculator";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

const resolveFile = (urlPath) => {
  const clean = urlPath.startsWith(PREFIX) ? urlPath.slice(PREFIX.length) || "/" : urlPath;
  // decodeURIComponent throws on malformed escapes; the caller turns that into a 400.
  const safe = normalize(decodeURIComponent(clean)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(ROOT, safe);
  if (!candidate.startsWith(ROOT)) return null;
  if (isFile(candidate)) return candidate;
  if (isFile(join(candidate, "index.html"))) return join(candidate, "index.html");
  // Unknown paths without an extension fall back to the app; missing assets are 404.
  return extname(safe) ? null : join(ROOT, "index.html");
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (url.pathname === PREFIX) {
    res.writeHead(301, { location: `${PREFIX}/${url.search}` }).end();
    return;
  }
  let file;
  try {
    file = resolveFile(url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" }).end("Bad request");
    return;
  }
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  // Only Vite's hashed files under assets/ are safe to cache forever.
  const hashed = file.startsWith(join(ROOT, "assets"));
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  createReadStream(file)
    .on("error", () => res.end())
    .pipe(res);
});
server.on("clientError", (_err, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(PORT, "0.0.0.0", () => {
  console.log(`avatar-calculator on :${PORT}`);
});
