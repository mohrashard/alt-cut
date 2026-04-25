import type { TimelineClip, Marker } from '../../lib/db';

// ─── Constants ────────────────────────────────────────────────
export const DEFAULT_PPS       = 80;        // pixels per second (default zoom)
export const MIN_PPS           = 20;
export const MAX_PPS           = 600;
export const RULER_HEIGHT      = 24;
export const TRACK_VIDEO_H     = 56;
export const TRACK_AUDIO_H     = 40;
export const TRACK_TEXT_H      = 34;
export const SNAP_THRESHOLD_PX = 10;        // px within which snapping activates

// ─── Types ────────────────────────────────────────────────────
export interface TrackState { locked: boolean; hidden: boolean; muted: boolean; }

export interface TimelineProps {
  clips: TimelineClip[];
  videoDuration: number;
  selectedClipId: number | null;
  playheadSeconds: number;
  onClipSelected: (id: number | null) => void;
  onPlayheadChange: (t: number) => void;
  onTimelineChange: () => void;
  // Undo/Redo
  onBeforeChange: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Markers
  markers: Marker[];
  projectId: number | null;
  onMarkersChange: () => void;
  // Ref for direct DOM playhead mutation (smooth playback)
  playheadDomRef?: React.RefObject<HTMLDivElement | null>;
  onPpsChange?: (pps: number) => void;
  // Ref to timecode span for direct DOM text update during playback
  timecodeDomRef?: React.RefObject<HTMLSpanElement | null>;
}
