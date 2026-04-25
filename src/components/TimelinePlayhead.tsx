import { useEffect, useRef } from 'react';

interface TimelinePlayheadProps {
  /** Initial pixel position — set once on mount, then the RAF loop takes over */
  initialLeftPx: number;
  /** Called when user finishes a drag or presses arrow keys */
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
  /** Project frames per second used for accurate keyboard seeking */
  fps?: number;
  /** Current time in seconds — used for aria-valuenow */
  currentTimeSec?: number;
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
  fps = 30,
  currentTimeSec = 0,
}: TimelinePlayheadProps) {
  // All mutable values live in refs — zero stale-closure risk in DOM callbacks
  const isDragging       = useRef(false);
  const ppsRef           = useRef(pps);
  const totalDurRef      = useRef(totalDur);
  const snapTargetsRef   = useRef(snapTargets);
  const magnetRef        = useRef(magnetOn);
  const fpsRef           = useRef(fps);
  const headRef          = useRef<HTMLButtonElement>(null);

  // Keep refs in sync every render (safe, synchronous)
  ppsRef.current         = pps;
  totalDurRef.current    = totalDur;
  snapTargetsRef.current = snapTargets;
  magnetRef.current      = magnetOn;
  fpsRef.current         = fps;

  // ── Set initial position & Dynamic Height ─────────────────────
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${initialLeftPx}px`;
    }

    const updateHeight = () => {
      if (tracksScrollRef.current && playheadRef.current) {
        // Height of the tracks scroll area (excluding horizontal scrollbar if any)
        const totalHeight = tracksScrollRef.current.clientHeight;
        playheadRef.current.style.height = `${totalHeight}px`;
      }
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    if (tracksScrollRef.current) ro.observe(tracksScrollRef.current);

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Snap helper ──────────────────────────────────────────────
  const snapPx = (rawPx: number): number => {
    if (!magnetRef.current) {
      headRef.current?.classList.remove('is-snapping');
      onSnapGuide?.(null);
      return rawPx;
    }
    for (const t of snapTargetsRef.current) {
      const targetPx = t * ppsRef.current;
      if (Math.abs(rawPx - targetPx) <= snapThresholdPx) {
        onSnapGuide?.(targetPx);
        headRef.current?.classList.add('is-snapping');
        return targetPx;
      }
    }
    onSnapGuide?.(null);
    headRef.current?.classList.remove('is-snapping');
    return rawPx;
  };

  // ── Drag handlers (attached to document, only when dragging) ──
  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !tracksScrollRef.current || !playheadRef.current) return;
    const rect     = tracksScrollRef.current.getBoundingClientRect();
    const rawPx    = e.clientX - rect.left + tracksScrollRef.current.scrollLeft;
    const clamped  = Math.max(0, Math.min(rawPx, totalDurRef.current * ppsRef.current));
    
    // Snapping to targets (clips/markers)
    const snappedTargetPx = snapPx(clamped);
    
    // Snapping to frames (Rule #3: Frame Accuracy)
    const sec = snappedTargetPx / ppsRef.current;
    const frame = Math.floor(sec * fpsRef.current);
    const frameSec = frame / fpsRef.current;
    
    playheadRef.current.style.left = `${frameSec * ppsRef.current}px`;
  };

  const onMouseUp = (_e: MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    playheadRef.current?.removeAttribute('data-playhead-dragging');
    headRef.current?.classList.remove('is-snapping');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup',   onMouseUp);
    onSnapGuide?.(null);

    if (!tracksScrollRef.current || !playheadRef.current) return;
    
    const curPx = parseFloat(playheadRef.current.style.left);
    onSeek(curPx / ppsRef.current);
  };

  // ── Only start dragging when user clicks the drag handle ──────
  const onHeadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    // Signal to PreviewWindow RAF to back off during drag
    playheadRef.current?.setAttribute('data-playhead-dragging', 'true');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  };

  // ── Keyboard frame stepping ──────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (!playheadRef.current) return;
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const frameSec  = 1 / fpsRef.current;
    const curPx     = parseFloat(playheadRef.current.style.left ?? '0');
    const curSec    = curPx / ppsRef.current;
    const nextSec   = Math.max(0, Math.min(totalDurRef.current, curSec + direction * frameSec));
    playheadRef.current.style.left = `${nextSec * ppsRef.current}px`;
    onSeek(nextSec);
  };

  return (
    <div
      ref={playheadRef as React.RefObject<HTMLDivElement>}
      role="slider"
      aria-label="Timeline playhead"
      aria-valuemin={0}
      aria-valuemax={totalDur}
      aria-valuenow={currentTimeSec}
      tabIndex={0}
      className="playhead-line"
      onKeyDown={onKeyDown}
    >
      {/* Drag handle (pentagon at top) — semantic button for accessibility */}
      <button
        type="button"
        ref={headRef}
        className="playhead-head"
        onMouseDown={onHeadMouseDown}
        aria-label="Drag playhead"
      />
    </div>
  );
}
