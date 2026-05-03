import { useRef, useCallback, useState, useMemo } from 'react';
import { RULER_HEIGHT, TRACK_VIDEO_H, TRACK_AUDIO_H, TRACK_TEXT_H } from './constants';
import type { TrackState } from './constants';
import type { TimelineClip, Transition } from '../../lib/db';
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
  transitions?: Transition[];
  onTransitionChange?: () => void;
}

function TransitionBadge({ clipA, clipB, overlapTime, pps, transition, onTransitionChange }: any) {
  const [open, setOpen] = useState(false);
  const leftPx = overlapTime * pps;
  
  const handleSelect = async (type: "ink" | "wipe" | "shutter" | "none") => {
    const db = await import('../../lib/db');
    if (type !== 'none') {
      await db.upsertTransition({
        track_id: clipA.track_index,
        clip_a_id: clipA.id,
        clip_b_id: clipB.id,
        type,
        duration_frames: 30,
      });
    } else {
      await db.deleteTransition(clipA.id, clipB.id);
    }
    onTransitionChange?.();
    setOpen(false);
  };

  return (
    <div style={{ position: 'absolute', left: leftPx, top: '50%', transform: 'translate(-50%, -50%)', zIndex: 15 }}>
      <button 
        style={{ background: transition ? '#8b5cf6' : '#374151', color: 'white', border: '1px solid #4b5563', borderRadius: '4px', fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        {transition ? transition.type : 'None'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', border: '1px solid #374151', borderRadius: '4px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', zIndex: 50 }}>
          <button style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '10px', cursor: 'pointer' }} onClick={() => handleSelect('ink')}>Ink</button>
          <button style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '10px', cursor: 'pointer' }} onClick={() => handleSelect('wipe')}>Wipe</button>
          <button style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '10px', cursor: 'pointer' }} onClick={() => handleSelect('shutter')}>Shutter</button>
          {transition && (
            <button style={{ background: 'transparent', color: '#ef4444', border: 'none', fontSize: '10px', cursor: 'pointer', marginTop: '4px' }} onClick={() => handleSelect('none')}>Remove</button>
          )}
        </div>
      )}
    </div>
  );
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
  transitions = [],
  onTransitionChange,
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

  const overlaps = useMemo(() => {
    const sorted = [...clips].sort((a, b) => a.timeline_start - b.timeline_start);
    const result: Array<{ clipA: TimelineClip, clipB: TimelineClip, overlapTime: number, transition?: Transition }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const clipA = sorted[i];
      const clipB = sorted[i+1];
      const clipAEnd = clipA.timeline_start + (clipA.end_time - clipA.start_time);
      if (clipAEnd > clipB.timeline_start + 0.05) { // Check for overlap > 0.05s
        const trans = transitions.find(t => t.clip_a_id === clipA.id && t.clip_b_id === clipB.id);
        result.push({
          clipA,
          clipB,
          overlapTime: clipB.timeline_start,
          transition: trans,
        });
      }
    }
    return result;
  }, [clips, transitions]);

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

        {/* Transition Badges for Overlaps */}
        {overlaps.map(ov => (
          <TransitionBadge
            key={`trans-${ov.clipA.id}-${ov.clipB.id}`}
            clipA={ov.clipA}
            clipB={ov.clipB}
            overlapTime={ov.overlapTime}
            pps={pps}
            transition={ov.transition}
            onTransitionChange={onTransitionChange}
          />
        ))}

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