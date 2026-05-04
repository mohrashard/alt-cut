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
  const isDragging = useRef(false);
  const dragOffsetRef = useRef(0);
  const ppsRef = useRef(pps);
  const totalDurRef = useRef(totalDur);
  const snapTargetsRef = useRef(snapTargets);
  const magnetRef = useRef(magnetOn);
  const fpsRef = useRef(fps);
  const headRef = useRef<HTMLButtonElement>(null);
  const lastLeftPx = useRef(initialLeftPx);

  // Keep refs in sync every render (safe, synchronous)
  ppsRef.current = pps;
  totalDurRef.current = totalDur;
  snapTargetsRef.current = snapTargets;
  magnetRef.current = magnetOn;
  fpsRef.current = fps;

  // ── Set initial position & Dynamic Height ─────────────────────
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${initialLeftPx}px`;
      lastLeftPx.current = initialLeftPx;
    }

    // Subtracts the scrollbar height so the playhead line doesn't
    // draw over or intercept clicks on the bottom scrollbar.
    const updateHeight = () => {
      if (tracksScrollRef.current && playheadRef.current) {
        const el = tracksScrollRef.current;
        const hasScrollbar = el.scrollWidth > el.clientWidth;
        const totalHeight = el.clientHeight - (hasScrollbar ? 14 : 0);
        playheadRef.current.style.height = `${totalHeight}px`;
      }
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    if (tracksScrollRef.current) ro.observe(tracksScrollRef.current);

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDragging.current && playheadRef.current) {
      const currentLeft = parseFloat(playheadRef.current.style.left || '0');
      if (currentLeft === 0 && lastLeftPx.current > 0) {
        playheadRef.current.style.left = `${lastLeftPx.current}px`;
      }
    }
  });

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

    const rect = tracksScrollRef.current.getBoundingClientRect();
    // dragOffsetRef is the pixel distance from the left edge of the playhead line
    // to where the user clicked inside the drag handle. This keeps the line from
    // jumping to the raw cursor position on the first move.
    const rawPx =
      e.clientX - rect.left + tracksScrollRef.current.scrollLeft - dragOffsetRef.current;
    const clamped = Math.max(0, Math.min(rawPx, totalDurRef.current * ppsRef.current));

    // Snap to clip/marker targets
    const snappedPx = snapPx(clamped);

    // Snap to the nearest frame boundary for frame accuracy
    const sec = snappedPx / ppsRef.current;
    const frame = Math.floor(sec * fpsRef.current);
    const frameSec = frame / fpsRef.current;

    playheadRef.current.style.left = `${frameSec * ppsRef.current}px`;
    lastLeftPx.current = frameSec * ppsRef.current;
  };

  const onMouseUp = (_e: MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // Clean up listeners immediately so they don't fire again
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    headRef.current?.classList.remove('is-snapping');
    onSnapGuide?.(null);

    if (!tracksScrollRef.current || !playheadRef.current) {
      playheadRef.current?.removeAttribute('data-playhead-dragging');
      return;
    }

    // Read the final position the drag settled on
    const finalPx = parseFloat(playheadRef.current.style.left ?? '0');
    const seekSec = finalPx / ppsRef.current;

    // FIX for snap-back (Bug #3):
    // We call onSeek first, then immediately write the pixel position back.
    // data-playhead-dragging stays set across TWO animation frames — enough
    // time for the player to accept the seek and for the RAF loop in
    // PreviewWindow to read the updated player time instead of the stale frame.
    // Removing the attribute only after both frames prevents the RAf loop from
    // overwriting style.left with the old position before the seek settles.
    onSeek(seekSec);

    // Immediately re-assert position so the RAF loop can't clobber it
    playheadRef.current.style.left = `${finalPx}px`;
    lastLeftPx.current = finalPx;

    // Wait two frames: first frame = seek accepted by player,
    // second frame = RAF loop reads updated player time
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        playheadRef.current?.removeAttribute('data-playhead-dragging');
      });
    });
  };

  // ── Only start dragging when user clicks the drag handle ──────
  const onHeadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!tracksScrollRef.current || !playheadRef.current) return;

    // FIX for cursor-offset bug (Bug #1):
    // The offset must be calculated from where style.left places the line,
    // NOT from the visual center of the line (which may be shifted by
    // transform: translateX(-50%) in CSS). We use the head button's
    // bounding rect to find where the user actually clicked within the line,
    // expressed in the same coordinate space as style.left (scroll-adjusted).
    const rect = tracksScrollRef.current.getBoundingClientRect();
    const cursorPxInTimeline = e.clientX - rect.left + tracksScrollRef.current.scrollLeft;
    const lineLeftPx = parseFloat(playheadRef.current.style.left ?? '0');

    // dragOffset = how far the cursor is from the line's style.left position.
    // On mousemove we subtract this so the line stays under the original click point.
    dragOffsetRef.current = cursorPxInTimeline - lineLeftPx;

    isDragging.current = true;

    // Signal to PreviewWindow RAF to stop writing style.left during drag.
    // Set BEFORE adding listeners so the flag is live on the first mousemove.
    playheadRef.current.setAttribute('data-playhead-dragging', 'true');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // ── Keyboard frame stepping ──────────────────────────────────
  // Uses integer frame arithmetic instead of floating-point addition,
  // so arrow keys never drift off frame boundaries over long timelines.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (!playheadRef.current) return;

    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const curPx = parseFloat(playheadRef.current.style.left ?? '0');
    const curSec = curPx / ppsRef.current;

    // 1. Convert current position to an exact integer frame number
    const currentFrame = Math.round(curSec * fpsRef.current);
    // 2. Step by exactly 1 frame (no floating-point drift)
    const nextFrame = currentFrame + direction;
    // 3. Convert back to seconds and clamp to timeline boundaries
    const nextSec = Math.max(0, Math.min(totalDurRef.current, nextFrame / fpsRef.current));

    playheadRef.current.style.left = `${nextSec * ppsRef.current}px`;
    lastLeftPx.current = nextSec * ppsRef.current;
    onSeek(nextSec);
  };

  return (
    // Note: if your CSS has `transform: translateX(-50%)` on `.playhead-line`,
    // the visual centre of the 2px line sits exactly on the frame boundary.
    // The drag-offset calculation above accounts for this correctly because it
    // reads style.left (the mathematical position) rather than getBoundingClientRect
    // (which would give the visually-shifted position).
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