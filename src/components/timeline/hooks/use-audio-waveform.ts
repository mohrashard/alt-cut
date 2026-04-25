import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

// Cache: filePath -> { raw channel data, sampleRate }
const audioCache = new Map<string, { data: Float32Array; sampleRate: number }>();

function downsample(data: Float32Array, targetCount: number): Float32Array {
  if (data.length === 0) return new Float32Array(targetCount);
  const result   = new Float32Array(targetCount);
  const blockSize = Math.max(1, Math.floor(data.length / targetCount));
  for (let i = 0; i < targetCount; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(data[start + j] ?? 0);
    }
    result[i] = sum / blockSize;
  }
  return result;
}

/**
 * Decodes an audio/video file's first audio channel and returns downsampled
 * amplitude samples for the [startTimeSec, startTimeSec + durationSec] window.
 * Returns null while loading.
 */
export function useAudioWaveform(
  filePath: string | undefined,
  startTimeSec: number,
  durationSec: number,
  sampleCount = 180,
): Float32Array | null {
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!filePath || durationSec <= 0) { setSamples(null); return; }

    const slice = (cached: { data: Float32Array; sampleRate: number }) => {
      const { data, sampleRate } = cached;
      const startSample = Math.floor(startTimeSec * sampleRate);
      const endSample   = Math.floor((startTimeSec + durationSec) * sampleRate);
      const window      = data.slice(startSample, Math.min(endSample, data.length));
      return downsample(window, sampleCount);
    };

    const cached = audioCache.get(filePath);
    if (cached) {
      setSamples(slice(cached));
      return;
    }

    let cancelled = false;
    const ac = new AudioContext();

    (async () => {
      try {
        const src = convertFileSrc(filePath);
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        const entry = { data: decoded.getChannelData(0), sampleRate: decoded.sampleRate };
        audioCache.set(filePath, entry);
        if (!cancelled && mounted.current) setSamples(slice(entry));
      } catch {
        // Not an audio file or decode failed — waveform stays null
      } finally {
        ac.close();
      }
    })();

    return () => { cancelled = true; };
  }, [filePath, startTimeSec, durationSec, sampleCount]);

  return samples;
}
