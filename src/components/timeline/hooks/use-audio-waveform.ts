import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

// ─── Cache ────────────────────────────────────────────────────────────────────
// Stores the full decoded channel for each file so seeking/trimming never
// re-fetches or re-decodes the same file.
const audioCache = new Map<string, { data: Float32Array; sampleRate: number }>();

// ─── In-flight deduplication ──────────────────────────────────────────────────
// Multiple clips using the same file (e.g. split clips) would each kick off
// their own fetch+decode without this. We share one Promise per file instead.
const inflight = new Map<string, Promise<{ data: Float32Array; sampleRate: number }>>();

// ─── Downsample ───────────────────────────────────────────────────────────────
// Average-absolute-value bucketing. Runs on a slice of the full decoded buffer
// so it's always O(sliceSamples), not O(totalSamples).
function downsample(data: Float32Array, targetCount: number): Float32Array {
  if (data.length === 0) return new Float32Array(targetCount);
  const result = new Float32Array(targetCount);
  const blockSize = Math.max(1, Math.floor(data.length / targetCount));
  for (let i = 0; i < targetCount; i++) {
    let sum = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    for (let j = start; j < end; j++) {
      const v = data[start + j];
      sum += v < 0 ? -v : v;
    }
    result[i] = sum / (end - start);
  }
  return result;
}

// ─── Slice + downsample a cached entry ────────────────────────────────────────
function sliceAndDownsample(
  cached: { data: Float32Array; sampleRate: number },
  startTimeSec: number,
  durationSec: number,
  sampleCount: number,
): Float32Array {
  const { data, sampleRate } = cached;
  const startSample = Math.floor(startTimeSec * sampleRate);
  const endSample = Math.min(Math.floor((startTimeSec + durationSec) * sampleRate), data.length);
  const window = data.subarray(startSample, endSample); // subarray = no copy
  return downsample(window, sampleCount);
}

/**
 * Decodes an audio/video file's first audio channel and returns downsampled
 * amplitude samples for the [startTimeSec, startTimeSec + durationSec] window.
 *
 * FASTER vs previous version:
 * - In-flight deduplication: N clips from the same file = 1 fetch/decode
 * - `subarray` instead of `slice` for zero-copy windowing
 * - Cache hit is fully synchronous (no state update needed if already cached)
 *
 * Returns null while loading.
 */
export function useAudioWaveform(
  filePath: string | undefined,
  startTimeSec: number,
  durationSec: number,
  sampleCount = 180,
): Float32Array | null {
  const [samples, setSamples] = useState<Float32Array | null>(() => {
    // FAST PATH: if already cached, compute synchronously during first render.
    // This avoids a blank frame for clips whose file was decoded by another
    // clip instance earlier in the same session.
    if (!filePath || durationSec <= 0) return null;
    const cached = audioCache.get(filePath);
    if (cached) return sliceAndDownsample(cached, startTimeSec, durationSec, sampleCount);
    return null;
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!filePath || durationSec <= 0) {
      setSamples(null);
      return;
    }

    // Cache hit — slice synchronously, no async needed
    const cached = audioCache.get(filePath);
    if (cached) {
      setSamples(sliceAndDownsample(cached, startTimeSec, durationSec, sampleCount));
      return;
    }

    let cancelled = false;

    // Deduplicate concurrent fetches for the same file
    let promise = inflight.get(filePath);
    if (!promise) {
      promise = (async () => {
        const ac = new AudioContext();
        try {
          const src = convertFileSrc(filePath);
          const res = await fetch(src);
          const buf = await res.arrayBuffer();
          const decoded = await ac.decodeAudioData(buf);
          // Store a *copy* — the AudioContext buffer is freed after close()
          const entry = {
            data: decoded.getChannelData(0).slice(),
            sampleRate: decoded.sampleRate,
          };
          audioCache.set(filePath, entry);
          return entry;
        } finally {
          ac.close();
          inflight.delete(filePath);
        }
      })();
      inflight.set(filePath, promise);
    }

    promise
      .then((entry) => {
        if (!cancelled && mountedRef.current) {
          setSamples(sliceAndDownsample(entry, startTimeSec, durationSec, sampleCount));
        }
      })
      .catch(() => {
        // Not an audio/video file, or decode failed — waveform stays null
      });

    return () => { cancelled = true; };
  }, [filePath, startTimeSec, durationSec, sampleCount]);

  return samples;
}