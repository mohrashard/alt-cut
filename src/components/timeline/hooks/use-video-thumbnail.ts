import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

// Module-level cache — persists across renders, never refetches the same frame
const cache = new Map<string, string>();

/**
 * Extracts a single video frame at `startTimeSec` and returns it as a JPEG dataURL.
 * Returns null while loading or if the file can't be read.
 */
export function useVideoThumbnail(
  filePath: string | undefined,
  startTimeSec: number,
): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!filePath) { setThumbnail(null); return; }

    const key = `${filePath}@${startTimeSec.toFixed(2)}`;
    if (cache.has(key)) {
      setThumbnail(cache.get(key)!);
      return;
    }

    const src = convertFileSrc(filePath);
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    video.src = src;
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const cleanup = () => { video.src = ''; video.load(); };

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.max(0, Math.min(startTimeSec, video.duration - 0.05));
    });

    video.addEventListener('seeked', () => {
      try {
        canvas.width  = Math.min(video.videoWidth  || 320, 320);
        canvas.height = Math.min(video.videoHeight || 180, 180);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          cache.set(key, dataUrl);
          if (mounted.current) setThumbnail(dataUrl);
        }
      } catch {
        // CORS / decode failure — thumbnail stays null
      }
      cleanup();
    });

    video.addEventListener('error', cleanup);
    return cleanup;
  }, [filePath, startTimeSec]);

  return thumbnail;
}
