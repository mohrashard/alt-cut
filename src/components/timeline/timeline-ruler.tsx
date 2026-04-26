import { useState, useEffect, useRef } from 'react';
import { RULER_HEIGHT } from './constants';

interface RulerTick {
  t: number;
  major: boolean;
  label: string;
}

interface TimelineRulerProps {
  ticks: RulerTick[];
  pps: number;
  totalWidth: number;
  onRulerMouseDown: (e: React.MouseEvent) => void;
  tracksRef: React.RefObject<HTMLDivElement | null>;
  playheadSeconds: number;
  totalDur: number;
}

export function TimelineRuler({
  ticks, pps, totalWidth, onRulerMouseDown, tracksRef, playheadSeconds, totalDur
}: TimelineRulerProps) {

  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(2000);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = tracksRef.current;
    if (!el) return;

    // Read initial values
    setScrollLeft(el.scrollLeft);
    setContainerWidth(el.clientWidth);

    // Throttle scroll updates with rAF to avoid layout thrashing
    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        setScrollLeft(el.scrollLeft);
        setContainerWidth(el.clientWidth);
        rafRef.current = null;
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tracksRef]);

  // Virtualize: only render ticks within the visible viewport + buffer
  const BUFFER_PX = 300;
  const visibleStart = Math.max(0, scrollLeft - BUFFER_PX);
  const visibleEnd = scrollLeft + containerWidth + BUFFER_PX;

  const visibleTicks = ticks.filter(({ t }) => {
    const px = t * pps;
    return px >= visibleStart && px <= visibleEnd;
  });

  const majorTicks = visibleTicks.filter(t => t.major);
  const minorTicks = visibleTicks.filter(t => !t.major);

  return (
    <div
      className="timeline-ruler"
      style={{ height: RULER_HEIGHT, width: '100%', minWidth: totalWidth }}
      onMouseDown={onRulerMouseDown}
      // Accessibility
      role="slider"
      tabIndex={0}
      aria-label="Timeline ruler"
      aria-valuemin={0}
      aria-valuemax={totalDur}
      aria-valuenow={Math.round(playheadSeconds * 100) / 100}
    >
      {majorTicks.map(({ t, label }) => (
        <div key={`maj-${t}`} className="ruler-tick" style={{ left: t * pps }}>
          <span className="ruler-label">{label}</span>
          <div className="ruler-tick-line major" />
        </div>
      ))}
      {minorTicks.map(({ t }) => (
        <div key={`min-${t}`} className="ruler-tick" style={{ left: t * pps }}>
          <div className="ruler-tick-line minor" />
        </div>
      ))}
    </div>
  );
}