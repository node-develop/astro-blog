import React, { useState, useCallback } from "react";
import MediaUploader from "./MediaUploader";
import MediaGrid, { type MediaAssetView } from "./MediaGrid";
import { actions } from "astro:actions";

interface Props {
  readonly initial: readonly MediaAssetView[];
}

export default function MediaPage({ initial }: Props): React.JSX.Element {
  const [items, setItems] = useState<readonly MediaAssetView[]>(initial);

  const refresh = useCallback(async () => {
    const res = await actions.media.list({});
    if (!res.error) {
      const mapped: MediaAssetView[] = res.data.items.map((a) => ({
        id: a.id,
        path: a.path,
        originalName: a.originalName,
        mimeType: a.mimeType,
        width: a.width,
        height: a.height,
        byteSize: a.byteSize,
        uploadedAt: new Date(a.uploadedAt).toISOString(),
      }));
      setItems(mapped);
    }
  }, []);

  return (
    <div>
      <MediaUploader onUploaded={refresh} />
      <MediaGrid items={items} />
    </div>
  );
}
