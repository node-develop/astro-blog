import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { contentAssets } from "../db/schema";
import { hash } from "./auth";
import { apiError, isApiError } from "./errors";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const formats: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heif: "image/avif",
  gif: "image/gif",
};
export const inspectImage = async (bytes: Uint8Array, declaredType: string) => {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw apiError(413, "image_too_large", "Images must contain 1 byte to 5 MiB.");
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
      animated: false,
    });
    const metadata = await decoder.metadata();
    if (
      !metadata.format ||
      !formats[metadata.format] ||
      formats[metadata.format] !== declaredType ||
      (metadata.format === "heif" && metadata.compression !== "av1")
    )
      throw apiError(
        422,
        "invalid_image",
        "Image bytes must match PNG, JPEG, WebP, AVIF or GIF Content-Type.",
      );
    if (!metadata.width || !metadata.height || metadata.width > 10000 || metadata.height > 10000)
      throw apiError(422, "image_dimensions", "Image exceeds 10,000px per side.");
    // Fully decode, orient, resize and re-encode. A valid-looking header alone
    // must not allow a corrupt image to be published. GIF uses its first frame.
    const { data, info } = await decoder
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES)
      throw apiError(413, "image_too_large", "Optimised image exceeds 5 MiB.");
    return {
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      extension: "webp",
      bytes: data,
    };
  } catch (error) {
    if (isApiError(error)) throw error;
    throw apiError(
      422,
      "invalid_image",
      "Image could not be decoded safely (invalid data or pixel limit exceeded).",
    );
  }
};

export const uploadImage = async (bytes: Uint8Array, mime: string, keyId: string) => {
  const info = await inspectImage(bytes, mime);
  const digest = hash(bytes);
  const [existing] = await db.select().from(contentAssets).where(eq(contentAssets.hash, digest));
  if (existing) return existing;
  const {
    CONTENT_S3_BUCKET: bucket,
    CONTENT_S3_PUBLIC_URL: publicUrl,
    CONTENT_S3_ACCESS_KEY_ID: accessKeyId,
    CONTENT_S3_SECRET_ACCESS_KEY: secretAccessKey,
    CONTENT_S3_ENDPOINT: endpoint,
  } = process.env;
  if (!bucket || !publicUrl || !accessKeyId || !secretAccessKey)
    throw apiError(503, "storage_not_configured", "Persistent image storage is not configured.");
  const base = new URL(publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`);
  if (base.protocol !== "https:" || base.search || base.hash)
    throw apiError(
      503,
      "storage_not_configured",
      "CONTENT_S3_PUBLIC_URL must be a public HTTPS base URL.",
    );
  const objectKey = `articles/${digest}.${info.extension}`;
  const client = new S3Client({
    region: process.env.CONTENT_S3_REGION ?? "auto",
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: process.env.CONTENT_S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: info.bytes,
        ContentType: info.mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  } finally {
    client.destroy();
  }
  // Content-addressed objects make retries safe even if a process dies after S3 succeeds.
  await db
    .insert(contentAssets)
    .values({
      hash: digest,
      objectKey,
      url: new URL(objectKey, base).href,
      keyId,
      mimeType: info.mimeType,
      width: info.width,
      height: info.height,
      byteSize: info.bytes.length,
    })
    .onConflictDoNothing({ target: contentAssets.hash });
  const [asset] = await db.select().from(contentAssets).where(eq(contentAssets.hash, digest));
  return asset!;
};
