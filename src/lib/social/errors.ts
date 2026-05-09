import type { SocialChannel, GenerationStage } from "./types.js";

export type SocialError =
  | { kind: "generation"; stage: GenerationStage; channel: SocialChannel; cause: unknown }
  | { kind: "transport"; channel: SocialChannel; status: number; retryable: boolean; body: string }
  | { kind: "policy"; channel: SocialChannel; reason: string }
  | { kind: "content"; channel: SocialChannel; reason: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: SocialError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: SocialError): Result<T> => ({ ok: false, error });

export const isOk = <T>(r: Result<T>): r is { ok: true; value: T } => r.ok;
export const isErr = <T>(r: Result<T>): r is { ok: false; error: SocialError } => !r.ok;

export const generationError = (
  stage: GenerationStage,
  channel: SocialChannel,
  cause: unknown,
): SocialError => ({ kind: "generation", stage, channel, cause });

export const transportError = (
  channel: SocialChannel,
  status: number,
  body: string,
): SocialError => ({
  kind: "transport",
  channel,
  status,
  retryable: status >= 500 || status === 429,
  body,
});

export const policyError = (channel: SocialChannel, reason: string): SocialError => ({
  kind: "policy",
  channel,
  reason,
});

export const contentError = (channel: SocialChannel, reason: string): SocialError => ({
  kind: "content",
  channel,
  reason,
});

export const stringifyError = (e: SocialError): string => {
  switch (e.kind) {
    case "generation":
      return `[${e.stage}/${e.channel}] generation failed: ${String(e.cause)}`;
    case "transport":
      return `[${e.channel}] HTTP ${e.status}: ${e.body.slice(0, 500)}`;
    case "policy":
      return `[${e.channel}] policy: ${e.reason}`;
    case "content":
      return `[${e.channel}] content: ${e.reason}`;
  }
};
