import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, isApiError } from "./errors";
import { logger } from "../logger";

export const readBytes = async (request: Request, limit: number): Promise<Uint8Array> => {
  if (Number(request.headers.get("content-length")) > limit)
    throw apiError(413, "request_too_large", "Request exceeds the size limit.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw apiError(413, "request_too_large", "Request exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
};
export const readJson = async (request: Request): Promise<unknown> => {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    throw apiError(415, "unsupported_media_type", "Use Content-Type: application/json.");
  const bytes = await readBytes(request, 1_048_576);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw apiError(400, "invalid_json", "Request must contain valid UTF-8 JSON.");
  }
};
export const idempotencyKey = (request: Request): string => {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key))
    throw apiError(
      400,
      "idempotency_key_required",
      "Send a 1–128 character Idempotency-Key (letters, digits, . _ : -).",
    );
  return key;
};
export const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });
export const handleApi = async (operation: () => Promise<Response>): Promise<Response> => {
  const requestId = randomUUID();
  try {
    const response = await operation();
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "Invalid request fields.",
            requestId,
            details: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        422,
        { "x-request-id": requestId },
      );
    const status = isApiError(error) ? error.status : 503;
    if (!isApiError(error))
      logger.error(
        { requestId, errorType: error instanceof Error ? error.name : "unknown" },
        "content API request failed",
      );
    return jsonResponse(
      {
        error: {
          code: isApiError(error) ? error.code : "service_unavailable",
          message: isApiError(error)
            ? error.message
            : "Content service is temporarily unavailable.",
          ...(isApiError(error) && error.details !== undefined ? { details: error.details } : {}),
          requestId,
        },
      },
      status,
      {
        "x-request-id": requestId,
        ...(status === 429 ? { "retry-after": "60" } : {}),
        ...(status === 401 ? { "www-authenticate": "Bearer" } : {}),
      },
    );
  }
};
