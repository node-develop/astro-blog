import { ok, err, transportError, policyError, contentError } from "../errors.js";
import type { Result } from "../errors.js";

const apiBase = (): string => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ""}`;

const channelHandle = (): string => {
  const id = process.env.TELEGRAM_CHANNEL_ID ?? "";
  return id.startsWith("@") ? id.slice(1) : id;
};

type TgResp =
  | { ok: true; result: { message_id: number } }
  | { ok: false; description?: string; error_code?: number };

export const sendMessage = async (opts: {
  text: string;
  mediaUrl?: string | null;
}): Promise<Result<{ id: string; url: string }>> => {
  const useSendPhoto = Boolean(opts.mediaUrl);
  const url = useSendPhoto ? `${apiBase()}/sendPhoto` : `${apiBase()}/sendMessage`;
  const body = useSendPhoto
    ? {
        chat_id: process.env.TELEGRAM_CHANNEL_ID ?? "",
        photo: opts.mediaUrl!,
        caption: opts.text,
        parse_mode: "MarkdownV2",
      }
    : {
        chat_id: process.env.TELEGRAM_CHANNEL_ID ?? "",
        text: opts.text,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    return err(policyError("tg_ru", `${response.status} ${(await response.text()).slice(0, 200)}`));
  }

  let json: TgResp;
  try {
    json = (await response.json()) as TgResp;
  } catch {
    return err(transportError("tg_ru", response.status, "non-json response"));
  }

  if (!json.ok) {
    const desc = (json as { description?: string }).description ?? "unknown error";
    return err(contentError("tg_ru", desc));
  }

  if (!response.ok) {
    return err(transportError("tg_ru", response.status, JSON.stringify(json)));
  }

  const id = String(json.result.message_id);
  return ok({
    id,
    url: `https://t.me/${channelHandle()}/${id}`,
  });
};
