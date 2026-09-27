import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./feedback.mjs";
import { handleExport, handleSearch, toCsv, validateSearch } from "./searchlog.mjs";
import { buildRecord } from "./src/lib/searchLog.ts";
import { COUNTRY_BY_ID, DEFAULT_STATE, NICHES } from "./src/lib/state.ts";

const req = (body, headers = {}, url = "/api/search") =>
  Object.assign(Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]), {
    url,
    headers: { host: "calc.artka.dev", "content-type": "application/json", origin: "https://calc.artka.dev", ...headers },
    socket: { remoteAddress: "1.2.3.4" },
  });
const res = () => {
  const r = { status: 0, body: "", headers: {}, headersSent: false };
  r.writeHead = (s, h = {}) => ((r.status = s), (r.headers = h), (r.headersSent = true), r);
  r.end = (b) => ((r.body = b ?? ""), r);
  return r;
};
const deps = async (over = {}) => ({
  path: join(await mkdtemp(join(tmpdir(), "slog-")), "sub", "searches.jsonl"),
  token: "secret-token",
  limiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  globalLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
  log: () => {},
  now: () => new Date("2026-09-27T10:00:00Z"),
  ...over,
});

const niche = NICHES[0];
const state = { ...DEFAULT_STATE, market: ["RU", "KZ"], niche: niche.id, idea: "  трекер привычек " };
const countries = state.market.map((id) => COUNTRY_BY_ID.get(id));
const record = buildRecord(state, countries, "ru", "0a1b2c3d-4e5");

describe("page record meets the server's schema", () => {
  it("round-trips through validateSearch unchanged except for trimming", () => {
    const v = validateSearch(JSON.parse(JSON.stringify(record)));
    expect(v).not.toBeNull();
    expect(v.idea).toBe("трекер привычек");
    expect(v.market).toEqual(["RU", "KZ"]);
    expect(v.top.map((x) => x.id).sort()).toEqual(["KZ", "RU"]);
    expect(v.top.reduce((s, x) => s + x.avatars, 0)).toBeCloseTo(v.avatars, -1);
  });

  it("rejects records with no niche or idea, bad ids or extra-long ideas", () => {
    expect(validateSearch({ ...record, niche: null, idea: "" })).toBeNull();
    expect(validateSearch({ ...record, market: ["ru"] })).toBeNull();
    expect(validateSearch({ ...record, idea: "x".repeat(201) })).toBeNull();
    expect(validateSearch({ ...record, niche: "<script>" })).toBeNull();
    expect(validateSearch({ ...record, avatars: Number.NaN })).toBeNull();
    expect(Object.keys(validateSearch({ ...record, email: "a@b.c" }))).not.toContain("email");
  });
});

describe("handleSearch and handleExport", () => {
  it("appends one JSON line per record with a timestamp", async () => {
    const d = await deps();
    const r = res();
    await handleSearch(req(record), r, d);
    await handleSearch(req(record), res(), d);
    expect(r.status).toBe(200);
    const lines = (await readFile(d.path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ts).toBe("2026-09-27T10:00:00.000Z");
  });

  it("refuses other origins and invalid bodies without writing", async () => {
    const d = await deps();
    const a = res();
    await handleSearch(req(record, { origin: "https://evil.example" }), a, d);
    const b = res();
    await handleSearch(req({ ...record, v: 2 }), b, d);
    expect([a.status, b.status]).toEqual([403, 400]);
    await expect(readFile(d.path, "utf8")).rejects.toThrow();
  });

  it("exports only with the right token, as JSONL or CSV", async () => {
    const d = await deps();
    await handleSearch(req(record), res(), d);
    const none = res();
    await handleExport(req("", {}, "/api/searches"), none, d);
    const wrong = res();
    await handleExport(req("", { authorization: "Bearer nope" }, "/api/searches"), wrong, d);
    expect([none.status, wrong.status]).toEqual([401, 401]);
    const csv = res();
    await handleExport(req("", { authorization: "Bearer secret-token" }, "/api/searches?format=csv"), csv, d);
    expect(csv.status).toBe(200);
    expect(csv.body).toContain("трекер привычек");
    const off = res();
    await handleExport(req("", {}, "/api/searches"), off, { ...d, token: "" });
    expect(off.status).toBe(404);
  });
});

describe("toCsv", () => {
  it("quotes separators and defuses spreadsheet formulas", () => {
    const csv = toCsv(`${JSON.stringify({ idea: '=HYPERLINK("x")', market: ["RU", "KZ"], top: [{ id: "RU", avatars: 5 }] })}\nnot json\n`);
    const row = csv.trim().split("\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain("RU KZ");
    expect(row).toContain("RU:5");
    expect(csv.trim().split("\n")).toHaveLength(2);
  });
});
