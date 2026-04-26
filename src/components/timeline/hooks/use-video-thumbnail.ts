import { useEffect, useState } from 'react';
import { thumbnailProcessor } from './thumbnail-processor';

export function useVideoThumbnail(
  filePath: string | undefined,
  startTimeSec: number,
): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!filePath) {
      setThumbnail(null);
      return;
    }

    thumbnailProcessor.getThumbnail(filePath, startTimeSec).then((url) => {
      if (isActive && url) {
        setThumbnail(url);
      }
    });

    return () => {
      isActive = false;
    };
  }, [filePath, startTimeSec]);

  return thumbnail;
}
