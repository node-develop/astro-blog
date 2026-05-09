import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import probeSync from "probe-image-size/sync.js";
import { writeMediaToPublic } from "~/lib/fs/media-writer";
import { UPLOADS_DIR } from "~/lib/fs/paths";
import { recordMediaAsset, listMedia, deleteMediaAsset } from "~/lib/db/repo/media";
import { assertAdmin } from "./_auth";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

export const media = {
  list: defineAction({
    input: z.object({}).optional(),
    handler: async (_, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      return { items: await listMedia() };
    },
  }),

  upload: defineAction({
    accept: "form",
    input: z.object({
      file: z
        .instanceof(File)
        .refine((f) => f.size > 0, "empty file")
        .refine((f) => f.size <= MAX_BYTES, "file too large"),
    }),
    handler: async ({ file }, context) => {
      const user = context.locals.user as { id: string; role?: string | null } | null;
      assertAdmin(user);
      if (!ALLOWED_MIME.has(file.type)) {
        throw new ActionError({ code: "BAD_REQUEST", message: `Unsupported type: ${file.type}` });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const probe = probeSync(Buffer.from(bytes));
      if (!probe) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Could not detect image dimensions",
        });
      }
      const { relativePath } = await writeMediaToPublic(UPLOADS_DIR, file.name, bytes);

      const record = await recordMediaAsset({
        path: relativePath,
        originalName: file.name,
        mimeType: file.type,
        width: probe.width,
        height: probe.height,
        byteSize: bytes.byteLength,
        uploadedById: user!.id,
      });
      return { ok: true as const, asset: record };
    },
  }),

  delete: defineAction({
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      const deleted = await deleteMediaAsset(id);
      // The file is left on disk intentionally — it may still be referenced
      // by an older revision. Orphan cleanup is a future operational job.
      return { ok: true as const, deleted };
    },
  }),
};
