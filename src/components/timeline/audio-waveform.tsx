import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  samples: Float32Array | null;
  /** CSS width the canvas should fill */
  width: number;
  height: number;
  color?: string;
}

export function AudioWaveform({ samples, width, height, color = '#10b981' }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !samples || samples.length === 0 || width <= 0 || height <= 0) return;

    // Use device pixel ratio for crisp rendering
    const dpr     = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const maxAmp   = Math.max(...samples) || 1;
    const centerY  = height / 2;
    const barW     = width / samples.length;

    // Draw mirror waveform (top + bottom reflection)
    for (let i = 0; i < samples.length; i++) {
      const norm      = samples[i] / maxAmp;
      const barHeight = Math.max(1, norm * height * 0.82);
      const x         = i * barW;
      const y         = centerY - barHeight / 2;

      // Gradient per-bar for a premium look
      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0,   color + 'cc');
      grad.addColorStop(0.5, color + 'ff');
      grad.addColorStop(1,   color + 'cc');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, Math.max(0.5, barW - 0.8), barHeight);
    }
  }, [samples, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform-canvas"
      style={{ width, height, display: 'block' }}
    />
  );
}
