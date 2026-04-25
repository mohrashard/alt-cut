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
  onRulerClick: (e: React.MouseEvent) => void;
}

export function TimelineRuler({ ticks, pps, totalWidth, onRulerClick }: TimelineRulerProps) {
  return (
    <div
      className="timeline-ruler"
      style={{ height: RULER_HEIGHT, width: totalWidth }}
      onClick={onRulerClick}
    >
      {ticks.filter(t => t.major).map(({ t, label }) => (
        <div key={`maj-${t}`} className="ruler-tick" style={{ left: t * pps }}>
          <span className="ruler-label">{label}</span>
          <div className="ruler-tick-line major" />
        </div>
      ))}
      {ticks.filter(t => !t.major).map(({ t }, i) => (
        <div
          key={`m${i}`}
          className="ruler-tick"
          style={{ left: t * pps }}
        >
          <div className="ruler-tick-line minor" />
        </div>
      ))}
    </div>
  );
}
