// Anonymous search log: validate a record from the page, append it as one
// JSON line, and export the file as JSONL or CSV behind a token.
// Pure helpers are exported for tests; side effects live in the handlers.
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";

export const MAX_BODY = 4_000;
/** Stop appending past this size; 200 MB is years of traffic for this page. */
export const MAX_FILE = 200 * 1024 * 1024;

const ENUMS = {
  lang: ["ru", "en"],
  mode: ["b2c", "b2b"],
  pricing: ["subscription", "one-off"],
  currency: ["usd", "rub", "eur"],
  ai: [null, "ever", "weekly", "daily"],
  verdict: ["critical", "small", "workable", "large", "mass"],
  preset: [null, "cis", "europe", "namerica", "latam", "asia", "mena", "africa", "world"],
  level: [2, 10, 50, 100, 1000],
};
const ISO = /^[A-Z]{2}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

const finite = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (v, list) => list.includes(v);

/**
 * Validate an untrusted record. Returns the clean record (only known fields,
 * control characters stripped from the idea) or null.
 */
export const validateSearch = (raw) => {
  if (typeof raw !== "object" || raw === null || raw.v !== 1) return null;
  const r = raw;
  if (typeof r.sid !== "string" || !/^[a-f0-9-]{4,40}$/.test(r.sid)) return null;
  for (const [k, list] of Object.entries(ENUMS)) if (!oneOf(r[k], list)) return null;
  if (!(r.niche === null || (typeof r.niche === "string" && SLUG.test(r.niche)))) return null;
  if (typeof r.idea !== "string" || r.idea.length > 200) return null;
  const idea = r.idea.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (r.niche === null && idea.length < 3) return null;
  if (!Array.isArray(r.market) || r.market.length < 1 || r.market.length > 250) return null;
  if (!r.market.every((id) => typeof id === "string" && ISO.test(id))) return null;
  if (!(r.customPct === null || finite(r.customPct, 0, 100))) return null;
  if (!finite(r.priceUsd, 0, 1e9) || !finite(r.share, 0, 100)) return null;
  // Records from before the affordability step have no `afford` field.
  const afford = r.afford === undefined || r.afford === null ? null : r.afford;
  if (!(afford === null || finite(afford, 0.1, 50))) return null;
  if (!finite(r.avatars, 0, 1e10) || !finite(r.tam, 0, 1e16) || !finite(r.revenue, 0, 1e16)) return null;
  if (!Array.isArray(r.top) || r.top.length > 5) return null;
  if (!r.top.every((x) => x && typeof x.id === "string" && ISO.test(x.id) && finite(x.avatars, 0, 1e10))) {
    return null;
  }
  return {
    v: 1,
    sid: r.sid,
    lang: r.lang,
    mode: r.mode,
    niche: r.niche,
    idea,
    preset: r.preset,
    market: r.market,
    level: r.level,
    customPct: r.customPct,
    pricing: r.pricing,
    priceUsd: r.priceUsd,
    currency: r.currency,
    share: r.share,
    ai: r.ai,
    afford,
    avatars: r.avatars,
    tam: r.tam,
    revenue: r.revenue,
    verdict: r.verdict,
    top: r.top.map((x) => ({ id: x.id, avatars: x.avatars })),
  };
};

const CSV_COLS = [
  "ts", "sid", "lang", "mode", "niche", "idea", "preset", "market", "level", "customPct",
  "pricing", "priceUsd", "currency", "share", "ai", "afford", "avatars", "tam", "revenue", "verdict", "top",
];
const csvCell = (v) => {
  const s =
    v == null ? "" : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? `${x.id}:${x.avatars}` : x)).join(" ") : String(v);
  // Quote everything that needs it; a leading =+-@ is neutralised against spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** JSONL text to CSV with a header row; malformed lines are skipped. */
export const toCsv = (jsonl) => {
  const rows = jsonl
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  return [CSV_COLS.join(","), ...rows.map((r) => CSV_COLS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
};

const readBody = (req, max) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendJson = (res, status, body) =>
  res
    .writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    .end(JSON.stringify(body));

/** POST handler. deps: { path, limiter, globalLimiter, log, now }. */
export const handleSearch = async (req, res, deps) => {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const origin = req.headers.origin;
  let originHost = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = "invalid";
  }
  if (originHost !== null && originHost !== host) return sendJson(res, 403, { error: "origin" });
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    return sendJson(res, 415, { error: "content_type" });
  }
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  if (!deps.limiter(ip) || !deps.globalLimiter("all")) return sendJson(res, 429, { error: "rate_limited" });

  let rec;
  try {
    rec = validateSearch(JSON.parse(await readBody(req, MAX_BODY)));
  } catch {
    return sendJson(res, 400, { error: "bad_body" });
  }
  if (!rec) return sendJson(res, 400, { error: "invalid" });

  try {
    const size = await stat(deps.path).then((s) => s.size, () => 0);
    if (size > MAX_FILE) {
      deps.log(`search: log is over ${MAX_FILE} bytes, record dropped`);
      return sendJson(res, 507, { error: "full" });
    }
    await mkdir(dirname(deps.path), { recursive: true });
    await appendFile(deps.path, `${JSON.stringify({ ts: deps.now().toISOString(), ...rec })}\n`);
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    deps.log(`search: write failed ${e instanceof Error ? e.message : String(e)}`);
    return sendJson(res, 500, { error: "write_failed" });
  }
};

const tokenOk = (given, expected) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * GET export, `Authorization: Bearer <SEARCH_EXPORT_TOKEN>`, `?format=csv`
 * for a spreadsheet (JSONL otherwise). 404 while no token is configured.
 */
export const handleExport = async (req, res, deps) => {
  const expected = deps.token;
  if (!expected) return sendJson(res, 404, { error: "not_found" });
  const auth = String(req.headers.authorization ?? "");
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !tokenOk(given, expected)) return sendJson(res, 401, { error: "unauthorized" });
  const text = await readFile(deps.path, "utf8").catch(() => "");
  const csv = new URL(req.url ?? "/", "http://x").searchParams.get("format") === "csv";
  const day = deps.now().toISOString().slice(0, 10);
  res
    .writeHead(200, {
      "content-type": csv ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="searches-${day}.${csv ? "csv" : "jsonl"}"`,
      "cache-control": "no-store",
    })
    .end(csv ? `﻿${toCsv(text)}` : text);
};
