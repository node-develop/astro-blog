// Feedback form backend: validate, rate-limit and forward to email via Resend.
// Pure helpers are exported for tests; side effects live in handleFeedback.

export const LIMITS = { message: 3000, name: 100, contact: 200, link: 4000, body: 20_000 };

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate an untrusted JSON body. Returns { ok: true, value } or
 * { ok: false, error }. A filled honeypot is reported as { ok: true, spam: true }
 * so bots get a normal-looking answer and nothing is sent.
 */
export const validateFeedback = (raw) => {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "bad_body" };
  if (str(raw.website)) return { ok: true, spam: true };
  const message = str(raw.message);
  const name = str(raw.name);
  const contact = str(raw.contact);
  const link = str(raw.link);
  if (message.length < 3) return { ok: false, error: "too_short" };
  if (message.length > LIMITS.message) return { ok: false, error: "too_long" };
  if (name.length > LIMITS.name || contact.length > LIMITS.contact) {
    return { ok: false, error: "too_long" };
  }
  if (link && (link.length > LIMITS.link || !/^https?:\/\//.test(link))) {
    return { ok: false, error: "bad_link" };
  }
  const lang = raw.lang === "en" ? "en" : "ru";
  return { ok: true, value: { message, name, contact, link, lang } };
};

/** Sliding-window limiter: at most `limit` hits per key within `windowMs`. */
export const createRateLimiter = ({ limit, windowMs }) => {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    hits.set(key, [...recent, now]);
    // Keep the map from growing without bound on a long-lived process.
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
};

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const buildEmail = (fb, { to, from, host }) => {
  const who = fb.name || "Без имени";
  const lines = [
    `Имя: ${fb.name || "не указано"}`,
    `Контакт: ${fb.contact || "не указан"}`,
    `Язык интерфейса: ${fb.lang}`,
    fb.link ? `Расчет: ${fb.link}` : null,
    `Сайт: ${host}`,
    "",
    fb.message,
  ].filter((l) => l !== null);
  return {
    from,
    to: [to],
    subject: `Калькулятор: сообщение от ${who}`.slice(0, 150),
    text: lines.join("\n"),
    html: `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(lines.join("\n"))}</pre>`,
    ...(looksLikeEmail(fb.contact) ? { reply_to: fb.contact } : {}),
  };
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
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(body));

/**
 * POST handler. deps: { env, fetch, limiter, globalLimiter, log }.
 * Without RESEND_API_KEY the form answers 503 so the page can show the
 * address to write to directly.
 */
export const handleFeedback = async (req, res, deps) => {
  const { env, limiter, globalLimiter, log } = deps;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const originHost = (() => {
    try {
      return origin ? new URL(origin).host : null;
    } catch {
      return "invalid";
    }
  })();
  // Browsers always send Origin on cross-site POSTs; a mismatch means another site.
  if (originHost !== null && originHost !== host) return sendJson(res, 403, { error: "origin" });
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    return sendJson(res, 415, { error: "content_type" });
  }
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  if (!limiter(ip) || !globalLimiter("all")) return sendJson(res, 429, { error: "rate_limited" });

  let parsed;
  try {
    parsed = JSON.parse(await readBody(req, LIMITS.body));
  } catch {
    return sendJson(res, 400, { error: "bad_body" });
  }
  const v = validateFeedback(parsed);
  if (!v.ok) return sendJson(res, 400, { error: v.error });
  if (v.spam) return sendJson(res, 200, { ok: true });

  const key = env.RESEND_API_KEY;
  if (!key) return sendJson(res, 503, { error: "not_configured" });
  const email = buildEmail(v.value, {
    to: env.FEEDBACK_TO || "a@artka.dev",
    from: env.FEEDBACK_FROM || "Калькулятор artka.dev <onboarding@resend.dev>",
    host,
  });
  try {
    const r = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(email),
    });
    if (!r.ok) {
      log(`feedback: resend responded ${r.status} ${(await r.text()).slice(0, 300)}`);
      return sendJson(res, 502, { error: "send_failed" });
    }
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    log(`feedback: send error ${e instanceof Error ? e.message : String(e)}`);
    return sendJson(res, 502, { error: "send_failed" });
  }
};
