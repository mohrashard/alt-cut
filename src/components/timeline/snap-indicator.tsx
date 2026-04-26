import type { RefObject } from 'react';
import { useSnapIndicatorPosition } from './hooks/use-snap-indicator-position';
import { TIMELINE_LAYERS } from './layers';
import type { SnapPoint } from './snapping';

/** Width of the rendered snap line in CSS pixels. */
export const TIMELINE_INDICATOR_LINE_WIDTH_PX = 2;

/**
 * Returns the `left` CSS value that places a line of the given width
 * pixel-perfectly centered on `x`, accounting for sub-pixel zoom shifts.
 *
 * Without this, at certain zoom levels the line can land between two
 * physical pixels and appear blurry or doubled.
 */
export function getCenteredLineLeft(x: number, _zoomLevel: number): number {
  // Round to the nearest 0.5px so the line always aligns to a physical pixel boundary.
  return Math.round(x * 2) / 2 - TIMELINE_INDICATOR_LINE_WIDTH_PX / 2;
}

interface SnapIndicatorProps {
  /** The active snap point, or null when snapping is inactive. */
  snapPoint: SnapPoint | null;
  /** Current pixels-per-second zoom level — used for sub-pixel centering. */
  zoomLevel: number;
  /** Whether the indicator should be visible. */
  isVisible: boolean;
  /** Ref to the outer timeline wrapper div (used to anchor height/position). */
  timelineRef: RefObject<HTMLDivElement | null>;
  /** Ref to the scrollable tracks container (used to anchor height/position). */
  tracksScrollRef: RefObject<HTMLDivElement | null>;
}

export function SnapIndicator({
  snapPoint,
  zoomLevel,
  isVisible,
  timelineRef,
  tracksScrollRef,
}: SnapIndicatorProps) {
  const { height, topPosition } = useSnapIndicatorPosition(timelineRef, tracksScrollRef);

  if (!isVisible || !snapPoint) return null;

  const left = getCenteredLineLeft(snapPoint.x, zoomLevel);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: topPosition,
        left,
        width: TIMELINE_INDICATOR_LINE_WIDTH_PX,
        height,
        zIndex: TIMELINE_LAYERS.snapIndicator,
        pointerEvents: 'none',
      }}
      className="bg-primary/40 opacity-80"
    />
  );
}