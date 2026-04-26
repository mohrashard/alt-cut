import { useRef, useCallback } from 'react';
import { RULER_HEIGHT, TRACK_VIDEO_H, TRACK_AUDIO_H, TRACK_TEXT_H } from './constants';
import type { TrackState } from './constants';
import type { TimelineClip } from '../../lib/db';
import { TimelineElement, AudioShadowElement } from './timeline-element';

// ─── Z-index layer tokens ────────────────────────────────────────────────────
// Centralised so the playhead, context menus, and tracks never fight over DOM order.
export const TIMELINE_LAYERS = {
  trackBackground: 0,
  trackButton: 1,   // invisible click-capture overlay
  trackContent: 2,   // clips live here
  snapIndicator: 10,
  playhead: 20,
  contextMenu: 30,
} as const;

// ─── TimelineTrackLabels ─────────────────────────────────────────────────────

interface TimelineTrackLabelsProps {
  textClips: TimelineClip[];
  trackStates: Record<string, TrackState>;
  openTrackMenu: string | null;
  setOpenTrackMenu: (t: string | null) => void;
  setTrackStates: (fn: (s: Record<string, TrackState>) => Record<string, TrackState>) => void;
}

export function TimelineTrackLabels({
  textClips,
  trackStates,
  openTrackMenu,
  setOpenTrackMenu,
  setTrackStates,
}: TimelineTrackLabelsProps) {
  return (
    <div className="timeline-track-labels" onClick={() => setOpenTrackMenu(null)}>
      <div className="tl-ruler-spacer" style={{ height: RULER_HEIGHT }} />
      {(['text', 'caption', 'video', 'audio'] as const).map(track => {
        const visible = track === 'text' ? textClips.length > 0 : true;
        if (!visible) return null;
        const h =
          track === 'video' ? TRACK_VIDEO_H
            : track === 'audio' ? TRACK_AUDIO_H
              : TRACK_TEXT_H;
        const ts = trackStates[track];
        return (
          <div
            key={track}
            className={`track-label ${track}-track`}
            style={{ height: h, position: 'relative' }}
          >
            <span className={ts.hidden ? 'tl-track-hidden' : ''}>
              {ts.locked ? '🔒' : ''}{ts.muted ? '🔇' : ''} {track.toUpperCase()}
            </span>
            <button
              className="tl-track-opts-btn"
              title="Track options"
              onClick={e => {
                e.stopPropagation();
                setOpenTrackMenu(openTrackMenu === track ? null : track);
              }}
            >⋯</button>
            {openTrackMenu === track && (
              <div className="tl-track-menu">
                <button onClick={() => {
                  setTrackStates(s => ({ ...s, [track]: { ...s[track], locked: !s[track].locked } }));
                  setOpenTrackMenu(null);
                }}>
                  {ts.locked ? '🔓 Unlock track' : '🔒 Lock track'}
                </button>
                <button onClick={() => {
                  setTrackStates(s => ({ ...s, [track]: { ...s[track], hidden: !s[track].hidden } }));
                  setOpenTrackMenu(null);
                }}>
                  {ts.hidden ? '👁 Show track' : '🙈 Hide track'}
                </button>
                <button onClick={() => {
                  setTrackStates(s => ({ ...s, [track]: { ...s[track], muted: !s[track].muted } }));
                  setOpenTrackMenu(null);
                }}>
                  {ts.muted ? '🔊 Unmute track' : '🔇 Mute track'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TimelineTrackContent ────────────────────────────────────────────────────

type TrackKind = 'video' | 'audio' | 'text' | 'caption';

interface DragClipState {
  clipIds: number[];
  offsets: Record<number, { origTimelineStart: number; currentTimelineStart: number }>;
}

interface DragVolumeState {
  clipIds: number[];
  volume: number;
}

interface TrimState {
  clipId: number;
  edge: 'left' | 'right';
  currentStart: number;
  currentEnd: number;
  currentTimelineStart: number;
}

interface TimelineElementSharedProps {
  pps: number;
  onClipSelected: (e: React.MouseEvent, clipId: number) => void;
  onClipDragStart: (e: React.MouseEvent, clip: TimelineClip) => void;
  onClipOptionsClick: (e: React.MouseEvent, clipId: number) => void;
  onTrimMouseDown: (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => void;
  trimState: TrimState | null;
  onVolumeChange: (clipId: number, volume: number) => void;
  onVolumeDragEnd: (clipId: number, volume: number) => void;
}

interface TimelineTrackContentProps {
  /** Which logical track this row represents */
  trackKind: TrackKind;
  /** All clips that belong on this track */
  clips: TimelineClip[];
  /** Extra clips rendered as audio-shadow ghosts (video track only) */
  shadowClips?: TimelineClip[];
  /** Current drag/volume overlay states */
  dragClip: DragClipState | null;
  dragVolume: DragVolumeState | null;
  selectedClipIds: number[];
  /** Pixels per second zoom level */
  pps: number;
  /** Called when the user clicks empty space on this track */
  onEmptyTrackClick: () => void;
  /** Droppable ref setter from dnd-kit (optional – only video/audio tracks need it) */
  droppableRef?: (node: HTMLElement | null) => void;
  /** Whether a dnd-kit drag is hovering this track */
  isOver?: boolean;
  /** Hint copy shown when the track has no clips */
  emptyHint?: React.ReactNode;
  /** Shared element interaction callbacks */
  elementProps: TimelineElementSharedProps;
}

export function TimelineTrackContent({
  trackKind,
  clips,
  shadowClips,
  dragClip,
  dragVolume,
  selectedClipIds,
  pps,
  onEmptyTrackClick,
  droppableRef,
  isOver = false,
  emptyHint,
  elementProps,
}: TimelineTrackContentProps) {
  // Whether a mousedown on the track button was immediately followed by a clip
  // drag — in that case we skip the deselect-on-mouseup.
  const didDragRef = useRef(false);

  const trackHeight =
    trackKind === 'video' ? TRACK_VIDEO_H
      : trackKind === 'audio' ? TRACK_AUDIO_H
        : TRACK_TEXT_H;

  // Resolve the final clip shape, accounting for live drag-volume overlay.
  const resolveClip = useCallback((clip: TimelineClip): TimelineClip => {
    if (dragVolume?.clipIds.includes(clip.id)) {
      return { ...clip, audio_volume: dragVolume.volume };
    }
    return clip;
  }, [dragVolume]);

  const renderClip = useCallback((clip: TimelineClip) => {
    const isDragging = dragClip?.clipIds.includes(clip.id) ?? false;
    const mappedDragClip = isDragging && dragClip
      ? { clipId: clip.id, currentTimelineStart: dragClip.offsets[clip.id].currentTimelineStart }
      : null;

    const finalClip = resolveClip(clip);

    return (
      <TimelineElement
        key={finalClip.id}
        clip={finalClip}
        trackType={(finalClip.track_type as 'video' | 'audio' | 'text') ?? 'video'}
        isSelected={selectedClipIds.includes(finalClip.id)}
        dragClip={mappedDragClip}
        {...elementProps}
      />
    );
  }, [dragClip, resolveClip, selectedClipIds, elementProps]);

  return (
    <div
      ref={droppableRef ?? undefined}
      className={`track-row ${trackKind}-track${isOver ? ' is-over' : ''}`}
      style={{ height: trackHeight, position: 'relative' }}
    >
      {/*
       * ── Invisible accessibility / click-capture button ──────────────────
       * Sits at z-index trackButton (below clips) and captures mousedown/up on
       * empty track space. Using a <button> makes this keyboard-accessible and
       * lets screen readers announce the track name.
       */}
      <button
        type="button"
        aria-label={`${trackKind} track – click to deselect`}
        style={{
          position: 'absolute',
          inset: 0,
          margin: 0,
          padding: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'default',
          zIndex: TIMELINE_LAYERS.trackButton,
        }}
        onMouseDown={() => { didDragRef.current = false; }}
        onMouseUp={() => {
          // Only deselect if the user didn't immediately start dragging a clip.
          if (!didDragRef.current) onEmptyTrackClick();
        }}
      />

      {/*
       * ── Clip content layer ───────────────────────────────────────────────
       * Sits above the button so clip pointer events win.
       */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          zIndex: TIMELINE_LAYERS.trackContent,
        }}
      >
        {/* Empty-track hint */}
        {clips.length === 0 && emptyHint && (
          <div className="empty-timeline-hint" style={{ pointerEvents: 'none' }}>
            {emptyHint}
          </div>
        )}

        {/* Main clips */}
        {clips.map(renderClip)}

        {/* Audio shadow ghosts (video-embedded audio displayed in the audio row) */}
        {shadowClips?.map(clip => {
          if (clip.audio_enabled === 0) return null;
          const finalClip = resolveClip(clip);
          const dur = finalClip.end_time - finalClip.start_time;
          const leftPx = finalClip.timeline_start * pps;
          const widthPx = Math.max(dur * pps, 8);
          return (
            <AudioShadowElement
              key={`va-${finalClip.id}`}
              clip={finalClip}
              dur={dur}
              leftPx={leftPx}
              widthPx={widthPx}
              onVolumeChange={elementProps.onVolumeChange}
              onVolumeDragEnd={elementProps.onVolumeDragEnd}
            />
          );
        })}
      </div>
    </div>
  );
}