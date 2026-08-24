export type Representation = "text/html" | "text/markdown";

interface AcceptEntry {
  readonly type: string;
  readonly subtype: string;
  readonly q: number;
  readonly specificity: number;
  readonly position: number;
}

interface CandidateScore {
  readonly representation: Representation;
  readonly q: number;
  readonly specificity: number;
  readonly position: number;
}

const REPRESENTATIONS: readonly Representation[] = ["text/html", "text/markdown"];
const TOKEN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;

const qualityFrom = (parameters: readonly string[]): number =>
  parameters.reduce((quality, parameter) => {
    const [rawName = "", rawValue = ""] = parameter.split("=", 2);
    if (rawName.trim().toLowerCase() !== "q") return quality;
    const parsed = Number(rawValue.trim());
    return Number.isNaN(parsed) ? quality : Math.max(0, Math.min(1, parsed));
  }, 1);

const parseAccept = (header: string): readonly AcceptEntry[] =>
  header.split(",").flatMap((raw, position) => {
    const [rawMediaType = "", ...parameters] = raw.split(";");
    const [type = "", subtype = "", extra] = rawMediaType.trim().toLowerCase().split("/");
    if (
      extra !== undefined ||
      !type ||
      !subtype ||
      (type !== "*" && !TOKEN.test(type)) ||
      (subtype !== "*" && !TOKEN.test(subtype)) ||
      (type === "*" && subtype !== "*")
    ) {
      return [];
    }

    return [
      {
        type,
        subtype,
        q: qualityFrom(parameters),
        specificity: type === "*" ? 0 : subtype === "*" ? 1 : 2,
        position,
      },
    ];
  });

const matches = (entry: AcceptEntry, representation: Representation): boolean => {
  const [candidateType, candidateSubtype] = representation.split("/");
  return (
    (entry.type === "*" || entry.type === candidateType) &&
    (entry.subtype === "*" || entry.subtype === candidateSubtype)
  );
};

const scoreCandidate = (
  entries: readonly AcceptEntry[],
  representation: Representation,
): CandidateScore | null => {
  const matched = entries.reduce<AcceptEntry | null>((best, entry) => {
    if (!matches(entry, representation)) return best;
    if (
      best === null ||
      entry.specificity > best.specificity ||
      (entry.specificity === best.specificity && entry.position < best.position)
    ) {
      return entry;
    }
    return best;
  }, null);
  if (!matched || matched.q <= 0) return null;
  return {
    representation,
    q: matched.q,
    specificity: matched.specificity,
    position: matched.position,
  };
};

const isBetterCandidate = (candidate: CandidateScore, best: CandidateScore): boolean =>
  candidate.q > best.q ||
  (candidate.q === best.q && candidate.specificity > best.specificity) ||
  (candidate.q === best.q &&
    candidate.specificity === best.specificity &&
    candidate.position < best.position) ||
  (candidate.q === best.q &&
    candidate.specificity === best.specificity &&
    candidate.position === best.position &&
    REPRESENTATIONS.indexOf(candidate.representation) <
      REPRESENTATIONS.indexOf(best.representation));

export const negotiateRepresentation = (accept: string | null): Representation | null => {
  if (accept === null || accept.trim() === "") return "text/html";
  const entries = parseAccept(accept);
  if (entries.length === 0) return "text/html";

  return (
    REPRESENTATIONS.reduce<CandidateScore | null>((best, representation) => {
      const candidate = scoreCandidate(entries, representation);
      if (candidate === null) return best;
      return best === null || isBetterCandidate(candidate, best) ? candidate : best;
    }, null)?.representation ?? null
  );
};

export const appendVary = (headers: Headers, ...tokens: readonly string[]): void => {
  const existing = (headers.get("Vary") ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const normalizedExisting = existing.map((token) => token.toLowerCase());
  const additions = tokens.filter(
    (token, position) =>
      !normalizedExisting.includes(token.toLowerCase()) &&
      tokens.findIndex((candidate) => candidate.toLowerCase() === token.toLowerCase()) === position,
  );
  const merged = [...existing, ...additions];
  if (merged.length > 0) headers.set("Vary", merged.join(", "));
};

const negotiatedHeaders = (contentType: string): Headers => {
  const headers = new Headers({ "Content-Type": contentType });
  appendVary(headers, "Accept", "Accept-Encoding");
  return headers;
};

export const markdownResponse = (request: Request, body: string, status = 200): Response =>
  new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: negotiatedHeaders("text/markdown; charset=utf-8"),
  });

export const notAcceptableResponse = (request: Request): Response => {
  const requested = request.headers.get("Accept") ?? "(not specified)";
  const body = [
    "This resource is available in:",
    "- text/html",
    "- text/markdown",
    "",
    `You requested: ${requested}`,
    "",
  ].join("\n");
  const headers = negotiatedHeaders("text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(request.method === "HEAD" ? null : body, { status: 406, headers });
};
