import type { TimelineClip } from '../../lib/db';
import { fmt } from './utils';

interface TrimState {
  clipId: number;
  currentStart: number;
  currentEnd: number;
  currentTimelineStart: number;
}

interface DragClipState {
  clipId: number;
  currentTimelineStart: number;
}

interface TimelineElementProps {
  clip: TimelineClip;
  trackType: 'video' | 'audio' | 'text';
  pps: number;
  selectedClipId: number | null;
  trimState: TrimState | null;
  dragClip: DragClipState | null;
  onClipSelected: (id: number | null) => void;
  onClipDragStart: (e: React.MouseEvent, clip: TimelineClip) => void;
  onClipRightClick: (e: React.MouseEvent, clipId: number) => void;
  onTrimMouseDown: (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => void;
}

export function TimelineElement({
  clip,
  trackType,
  pps,
  selectedClipId,
  trimState,
  dragClip,
  onClipSelected,
  onClipDragStart,
  onClipRightClick,
  onTrimMouseDown,
}: TimelineElementProps) {
  let dur    = clip.end_time - clip.start_time;
  let tStart = clip.timeline_start;

  if (trimState?.clipId === clip.id) {
    dur    = trimState.currentEnd - trimState.currentStart;
    tStart = trimState.currentTimelineStart;
  } else if (dragClip?.clipId === clip.id) {
    tStart = dragClip.currentTimelineStart;
  }

  const leftPx     = tStart * pps;
  const widthPx    = Math.max(dur * pps, 8);
  const isSel      = clip.id === selectedClipId;
  const isBusy     = clip.ai_metadata?.['captions']?.status === 'processing' ||
                     clip.ai_metadata?.['denoise']?.status === 'processing';
  const isDragging = dragClip?.clipId === clip.id;
  const isMuted    = clip.audio_enabled === 0;
  const label      = clip.file_path?.split(/[/\\]/).pop() ?? '';
  const shortLabel = dur < 2 ? '' : label;

  return (
    <div
      key={clip.id}
      className={`clip-block ${trackType} ${isSel ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isMuted ? 'muted' : ''}`}
      style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
      onClick={(e) => { e.stopPropagation(); onClipSelected(isSel ? null : clip.id); }}
      onMouseDown={(e) => { if (e.button === 0) onClipDragStart(e, clip); }}
      onContextMenu={(e) => onClipRightClick(e, clip.id)}
      title={`${label}\n${fmt(clip.timeline_start)} → ${fmt(clip.timeline_start + dur)}`}
    >
      {/* Left trim handle */}
      <div
        className="trim-handle trim-handle-left"
        onMouseDown={(e) => onTrimMouseDown(e, clip, 'left')}
      />

      {/* Clip content */}
      <div className="clip-label">
        {isBusy && <span className="spin" style={{ marginRight: 4 }}>⚙️</span>}
        {isMuted && <span style={{ marginRight: 4 }}>🔇</span>}
        <span>{shortLabel}</span>
        {trackType === 'video' && <span className="clip-dur">{fmt(dur)}</span>}
      </div>

      {/* Right trim handle */}
      <div
        className="trim-handle trim-handle-right"
        onMouseDown={(e) => onTrimMouseDown(e, clip, 'right')}
      />
    </div>
  );
}
