import React, { useRef, useState } from "react";
import { actions } from "astro:actions";

interface Props {
  readonly onUploaded: () => void;
}

export default function MediaUploader({ onUploaded }: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      const result = await actions.media.upload(form);
      if (result.error) {
        setError(result.error.message ?? "Upload failed");
        break;
      }
    }
    setUploading(false);
    onUploaded();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className="media-uploader"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handle(e.dataTransfer?.files ?? null);
      }}
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "Загрузка…" : "Выбрать файлы"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        multiple
        hidden
        onChange={(e) => void handle(e.target.files)}
      />
      <p>Или перетащите сюда (до 5 MB, PNG/JPEG/WebP/AVIF/GIF)</p>
      {error && (
        <p className="media-uploader__error" role="alert">
          {error}
        </p>
      )}
      <style>{`
        .media-uploader {
          border: 1px dashed var(--color-border-strong); border-radius: var(--radius-lg);
          padding: var(--space-5); text-align: center;
          color: var(--color-fg-muted);
        }
        .media-uploader button {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-4); border: 1px solid var(--color-accent);
          color: var(--color-accent); background: transparent; cursor: pointer;
          border-radius: var(--radius-md);
        }
        .media-uploader__error { color: var(--color-danger); }
      `}</style>
    </div>
  );
}
