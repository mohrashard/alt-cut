import { useEffect, useRef } from 'react';

interface TimelinePlayheadProps {
  /** Initial pixel position — set once on mount, then the RAF loop takes over */
  initialLeftPx: number;
  /** Called when user drags or clicks ruler — this updates React state for seeking */
  onSeek: (sec: number) => void;
  /** Current pps so drag can compute seconds from pixels */
  pps: number;
  /** Total duration in seconds (clamp boundary) */
  totalDur: number;
  /** The scrollable tracks container — needed to offset drag position */
  tracksScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Expose the root div ref externally (PreviewWindow RAF writes style.left here) */
  playheadRef: React.RefObject<HTMLDivElement | null>;
  /** If snapping is active this can set a snap guide */
  onSnapGuide?: (x: number | null) => void;
  snapTargets?: number[];
  snapThresholdPx?: number;
  magnetOn?: boolean;
}

export function TimelinePlayhead({
  initialLeftPx,
  onSeek,
  pps,
  totalDur,
  tracksScrollRef,
  playheadRef,
  onSnapGuide,
  snapTargets = [],
  snapThresholdPx = 10,
  magnetOn = true,
}: TimelinePlayheadProps) {
  const isDragging = useRef(false);
  // Keep pps/totalDur/snapTargets in refs so drag callbacks never go stale
  const ppsRef          = useRef(pps);
  const totalDurRef     = useRef(totalDur);
  const snapTargetsRef  = useRef(snapTargets);
  const magnetRef       = useRef(magnetOn);

  ppsRef.current         = pps;
  totalDurRef.current    = totalDur;
  snapTargetsRef.current = snapTargets;
  magnetRef.current      = magnetOn;

  // Set initial position once on mount — after that, only RAF / drag touch it
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${initialLeftPx}px`;
    }
    // intentionally no deps — run once only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapPx = (rawPx: number): number => {
    if (!magnetRef.current) return rawPx;
    for (const t of snapTargetsRef.current) {
      const targetPx = t * ppsRef.current;
      if (Math.abs(rawPx - targetPx) <= snapThresholdPx) {
        onSnapGuide?.(targetPx);
        return targetPx;
      }
    }
    onSnapGuide?.(null);
    return rawPx;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !tracksScrollRef.current || !playheadRef.current) return;
    const rect = tracksScrollRef.current.getBoundingClientRect();
    const rawPx = e.clientX - rect.left + tracksScrollRef.current.scrollLeft;
    const clampedPx = Math.max(0, Math.min(rawPx, totalDurRef.current * ppsRef.current));
    const snappedPx = snapPx(clampedPx);
    // Move playhead DOM directly — no React state during drag
    playheadRef.current.style.left = `${snappedPx}px`;
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    onSnapGuide?.(null);

    // Commit the final position to React state (triggers player seek)
    if (tracksScrollRef.current) {
      const rect = tracksScrollRef.current.getBoundingClientRect();
      const rawPx = e.clientX - rect.left + tracksScrollRef.current.scrollLeft;
      const clampedPx = Math.max(0, Math.min(rawPx, totalDurRef.current * ppsRef.current));
      const snappedPx = snapPx(clampedPx);
      onSeek(snappedPx / ppsRef.current);
    }
  };

  const onHeadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const frameSec = 1 / 30;
    if (!playheadRef.current) return;
    // Read current pixel position directly from DOM
    const curPx = parseFloat(playheadRef.current.style.left ?? '0');
    const curSec = curPx / ppsRef.current;
    const nextSec = Math.max(0, Math.min(totalDurRef.current, curSec + direction * frameSec));
    // Update DOM immediately for instant feedback
    playheadRef.current.style.left = `${nextSec * ppsRef.current}px`;
    // Commit to React state → triggers player seek
    onSeek(nextSec);
  };

  return (
    <div
      ref={playheadRef as React.RefObject<HTMLDivElement>}
      role="slider"
      aria-label="Timeline playhead"
      aria-valuemin={0}
      aria-valuemax={totalDur}
      tabIndex={0}
      className="playhead-line"
      // NO style.left here — position is 100% DOM-controlled
      onKeyDown={onKeyDown}
    >
      {/* Drag handle — the triangle/circle at top */}
      <div
        className="playhead-head"
        onMouseDown={onHeadMouseDown}
        aria-label="Drag playhead"
      />
    </div>
  );
}
