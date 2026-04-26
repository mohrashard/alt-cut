import { useEffect, useRef, useCallback } from 'react';

interface AudioWaveformProps {
  samples: Float32Array | null;
  width: number;
  height: number;
  /** Background color of the track. Default: '#0d9669' (dark emerald) */
  trackColor?: string;
  /** Bar color drawn on top. Default: white */
  barColor?: string;
  /** 0–1 blend of RMS vs peak. Default: 0.35 */
  rmsBlend?: number;
}

export function AudioWaveform({
  samples,
  width,
  height,
  trackColor = '#0d9669',
  barColor = 'rgba(255,255,255,0.92)',
  rmsBlend = 0.35,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(
    (canvas: HTMLCanvasElement, w: number, h: number) => {
      if (w <= 0 || h <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);

      // ── 1. Track background (CapCut uses a solid colored bar) ────────────
      ctx.fillStyle = trackColor;
      ctx.fillRect(0, 0, w, h);

      // ── 2. If no samples yet, draw a flat centre line as placeholder ──────
      if (!samples || samples.length === 0) {
        ctx.fillStyle = barColor;
        ctx.fillRect(0, h / 2 - 1, w, 2);
        return;
      }

      // ── 3. Bucketing ──────────────────────────────────────────────────────
      const numBuckets = Math.max(1, Math.floor(w));
      const chunkSize = Math.floor(samples.length / numBuckets);
      if (chunkSize === 0) {
        ctx.fillStyle = barColor;
        ctx.fillRect(0, h / 2 - 1, w, 2);
        return;
      }

      const peakBuckets = new Float32Array(numBuckets);
      const rmsBuckets = new Float32Array(numBuckets);
      let globalMax = 0;

      for (let i = 0; i < numBuckets; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, samples.length);
        let chunkMax = 0;
        let sumSq = 0;
        for (let j = start; j < end; j++) {
          const s = samples[j];
          const abs = s < 0 ? -s : s;
          if (abs > chunkMax) chunkMax = abs;
          sumSq += s * s;
        }
        peakBuckets[i] = chunkMax;
        rmsBuckets[i] = end > start ? Math.sqrt(sumSq / (end - start)) : 0;
        if (chunkMax > globalMax) globalMax = chunkMax;
      }

      const maxAmp = globalMax > 0 ? globalMax : 1;
      const centerY = h / 2;
      const barW = w / numBuckets;

      // ── 4. CapCut-style: white mirrored bars centred on track ─────────────
      // Each bar is drawn symmetrically above AND below the centre line,
      // using the full available height. A small gap ensures bars never
      // touch the very top/bottom edge (looks cleaner).
      const maxBarHalf = centerY * 0.88; // leave ~6% padding top & bottom
      const minBarHalf = 1.5;            // minimum visible nub even for silence

      ctx.fillStyle = barColor;

      for (let i = 0; i < numBuckets; i++) {
        const peak = peakBuckets[i] / maxAmp;
        const rms = rmsBuckets[i] / maxAmp;
        const norm = rms * rmsBlend + peak * (1 - rmsBlend);

        // Half-height of the symmetric bar
        const halfH = Math.max(minBarHalf, norm * maxBarHalf);

        const x = i * barW;
        const bw = Math.max(0.5, barW - 0.8);

        // Draw as a single rect from top-of-bar to bottom-of-bar
        ctx.fillRect(x, centerY - halfH, bw, halfH * 2);
      }

      // ── 5. Subtle dark centre line for depth (CapCut has a thin separator) ─
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, centerY - 0.5, w, 1);
    },
    [samples, trackColor, barColor, rmsBlend],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, width, height);
  }, [draw, width, height]);

  // Re-draw on container resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      const w = e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width;
      const h = e.contentBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (Math.abs(w - width) > 1 || Math.abs(h - height) > 1) draw(canvas, w, h);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform-canvas"
      style={{ width, height, display: 'block' }}
      aria-label="Audio waveform"
      role="img"
    />
  );
}