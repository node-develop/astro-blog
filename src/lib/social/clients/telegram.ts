import { ok, err, transportError, contentError, httpFailure, isAuthFailure } from "../errors.js";
import type { Result } from "../errors.js";
import { logger } from "../../logger";

const apiBase = (): string => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ""}`;

/**
 * Build the public t.me URL for a posted message. Two channel-id forms:
 *   "@username"          → https://t.me/username/<msgId>
 *   "-100xxxxxxxxxx"     → https://t.me/c/xxxxxxxxxx/<msgId>  (private channel)
 *   numeric chat id (-x) → no public URL; return empty (externalId still saved).
 */
const buildPostUrl = (messageId: string): string => {
  const id = process.env.TELEGRAM_CHANNEL_ID ?? "";
  if (id.startsWith("@")) return `https://t.me/${id.slice(1)}/${messageId}`;
  if (id.startsWith("-100")) return `https://t.me/c/${id.slice(4)}/${messageId}`;
  return "";
};

/**
 * sendPhoto rejections that are about the picture, not the post: Telegram could
 * not fetch the URL (an /og card of a post that is not deployed yet), the file
 * is not an image, or the text does not fit a photo caption (1024 characters
 * against 4096 for a message). The text is still worth sending.
 */
const PHOTO_REJECTED =
  /failed to get http url content|wrong (file identifier|type of the web page content)|caption is too long|photo_invalid/i;

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

  if (isAuthFailure(response.status)) {
    return err(httpFailure("tg_ru", response.status, await response.text()));
  }

  let json: TgResp;
  try {
    json = (await response.json()) as TgResp;
  } catch {
    return err(transportError("tg_ru", response.status, "non-json response"));
  }

  if (!json.ok) {
    const desc = (json as { description?: string }).description ?? "unknown error";
    if (useSendPhoto && PHOTO_REJECTED.test(desc)) {
      logger.warn(
        { mod: "social", channel: "tg_ru", mediaUrl: opts.mediaUrl, reason: desc },
        "telegram rejected the photo; sending the post as text",
      );
      return sendMessage({ text: opts.text });
    }
    return err(contentError("tg_ru", desc));
  }

  if (!response.ok) {
    return err(transportError("tg_ru", response.status, JSON.stringify(json)));
  }

  const id = String(json.result.message_id);
  return ok({
    id,
    url: buildPostUrl(id),
  });
};
