import { ok, err, transportError, policyError } from "../errors.js";
import type { Result } from "../errors.js";

const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

const apiBase = (): string => "https://api.twitter.com";

const headers = (): Record<string, string> => ({
  Authorization: `Bearer ${process.env.X_OAUTH_TOKEN ?? ""}`,
  "Content-Type": "application/json",
});

const handleResponse = async (response: Response): Promise<Result<{ id: string }>> => {
  if (response.ok) {
    const j = (await response.json()) as { data: { id: string } };
    return ok({ id: j.data.id });
  }
  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    return err(policyError("x_en", `${response.status} ${body.slice(0, 200)}`));
  }
  return err(transportError("x_en", response.status, body));
};

export const postTweet = async (opts: {
  text: string;
  reply?: { in_reply_to_tweet_id: string };
}): Promise<Result<{ id: string; url: string }>> => {
  const response = await fetch(`${apiBase()}/2/tweets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(opts),
  });
  const r = await handleResponse(response);
  if (!r.ok) return r;
  const handle = process.env.X_HANDLE ?? "x";
  return ok({ id: r.value.id, url: `https://x.com/${handle}/status/${r.value.id}` });
};

export const postThread = async (parts: string[]): Promise<Result<{ id: string; url: string }>> => {
  if (parts.length === 0) return err(transportError("x_en", 0, "empty thread"));
  let firstId: string | null = null;
  let lastId: string | null = null;
  for (let i = 0; i < parts.length; i += 1) {
    const t = parts[i]!;
    const opts = lastId ? { text: t, reply: { in_reply_to_tweet_id: lastId } } : { text: t };
    const r = await postTweet(opts);
    if (!r.ok) {
      const status = r.error.kind === "transport" ? r.error.status : 0;
      return err(
        transportError(
          "x_en",
          status,
          `thread broke at part ${i + 1}/${parts.length} (firstId=${firstId})`,
        ),
      );
    }
    if (i === 0) firstId = r.value.id;
    lastId = r.value.id;
    if (i < parts.length - 1) await sleep(1500);
  }
  const handle = process.env.X_HANDLE ?? "x";
  return ok({
    id: firstId!,
    url: `https://x.com/${handle}/status/${firstId}`,
  });
};
