import { MIN_PPS, MAX_PPS } from './constants';

// ─── Zoom Math ────────────────────────────────────────────────
export const sliderToZoom = (pos: number) => MIN_PPS * Math.pow(MAX_PPS / MIN_PPS, pos);
export const zoomToSlider = (pps: number) => Math.log(pps / MIN_PPS) / Math.log(MAX_PPS / MIN_PPS);

// ─── Time formatting ──────────────────────────────────────────
export const fmt = (s: number, showDecimals: boolean = true) => {
  const m  = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  if (!showDecimals) return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
  const ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${ms}`;
};

// ─── Ruler tick generator ─────────────────────────────────────
export function getRulerTicks(pps: number, totalDur: number) {
  // Choose a nice interval based on zoom
  const intervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 300, 600];
  const targetPx  = 85; // min px between labels
  const interval  = intervals.find(i => i * pps >= targetPx) ?? 600;

  const ticks: { t: number; major: boolean; label: string }[] = [];
  const count = Math.ceil(totalDur / interval) + 2;
  const showDecimals = interval < 1;

  for (let i = 0; i <= count; i++) {
    const t = i * interval;
    ticks.push({ t, major: true, label: fmt(t, showDecimals) });
    // minor ticks
    if (interval >= 0.5) {
      const minorCount = interval >= 60 ? 4 : 5; // 4 or 5 subdivisions
      for (let j = 1; j < minorCount; j++) {
        const mt = t + (j * interval) / minorCount;
        if (mt < totalDur + interval) ticks.push({ t: mt, major: false, label: '' });
      }
    }
  }
  return { ticks, interval };
}
