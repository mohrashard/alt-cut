import type { TimelineClip } from '../../lib/db';
import { fmt } from './utils';
import { useVideoThumbnail } from './hooks/use-video-thumbnail';
import { useAudioWaveform } from './hooks/use-audio-waveform';
import { AudioWaveform } from './audio-waveform';

// Track heights (must match constants.ts + CSS)
const VIDEO_H = 56;
const AUDIO_H = 40;
const THUMB_ASPECT = 16 / 9;

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

// ─── Video thumbnail background ───────────────────────────────
function VideoContent({ clip, dur }: { clip: TimelineClip; dur: number }) {
  const thumbnail = useVideoThumbnail(clip.file_path, clip.start_time);
  const tileW     = Math.round(VIDEO_H * THUMB_ASPECT); // ~99px
  const label     = clip.file_path?.split(/[/\\]/).pop() ?? '';

  return (
    <>
      {/* Tiled thumbnail background */}
      {thumbnail && (
        <div
          className="clip-thumb-bg"
          style={{
            backgroundImage: `url(${thumbnail})`,
            backgroundSize: `${tileW}px ${VIDEO_H * 0.8}px`,
          }}
        />
      )}
      {/* Top gradient header with filename + duration */}
      <div className="clip-thumb-header">
        {dur >= 2 && <span className="clip-thumb-name">{label}</span>}
        <span className="clip-dur clip-thumb-dur">{fmt(dur)}</span>
      </div>
    </>
  );
}

// ─── Audio waveform content ───────────────────────────────────
function AudioContent({ clip, dur, widthPx }: { clip: TimelineClip; dur: number; widthPx: number }) {
  const samples   = useAudioWaveform(clip.file_path, clip.start_time, dur);
  const isMuted   = clip.audio_enabled === 0;
  const label     = clip.file_path?.split(/[/\\]/).pop() ?? '';

  return (
    <>
      {/* Waveform canvas fills the clip behind the label */}
      {samples && !isMuted && (
        <div className="clip-waveform-wrap">
          <AudioWaveform
            samples={samples}
            width={widthPx}
            height={AUDIO_H * 0.7}
            color="#10b981"
          />
        </div>
      )}
      {/* Label row */}
      <div className="clip-label">
        {isMuted && <span style={{ marginRight: 4 }}>🔇</span>}
        {dur >= 2 && <span>{label}</span>}
      </div>
    </>
  );
}

// ─── Text / caption content ───────────────────────────────────
function TextContent({ clip, dur }: { clip: TimelineClip; dur: number }) {
  const label = clip.file_path?.split(/[/\\]/).pop() ?? '';
  return (
    <div className="clip-label">
      <span>{dur >= 2 ? label : ''}</span>
    </div>
  );
}

// ─── Main element ─────────────────────────────────────────────
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

  return (
    <div
      className={`clip-block ${trackType} ${isSel ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isMuted ? 'muted' : ''}`}
      style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
      onClick={(e) => { e.stopPropagation(); onClipSelected(isSel ? null : clip.id); }}
      onMouseDown={(e) => { if (e.button === 0) onClipDragStart(e, clip); }}
      onContextMenu={(e) => onClipRightClick(e, clip.id)}
      title={`${label}\n${fmt(clip.timeline_start)} → ${fmt(clip.timeline_start + dur)}`}
    >
      {/* Left trim handle */}
      <div className="trim-handle trim-handle-left" onMouseDown={(e) => onTrimMouseDown(e, clip, 'left')} />

      {/* Per-track rich content */}
      {trackType === 'video' && <VideoContent clip={clip} dur={dur} />}
      {trackType === 'audio' && <AudioContent clip={clip} dur={dur} widthPx={widthPx} />}
      {trackType === 'text'  && <TextContent  clip={clip} dur={dur} />}

      {/* AI busy indicator */}
      {isBusy && (
        <span className="clip-busy-spin">⚙️</span>
      )}

      {/* Right trim handle */}
      <div className="trim-handle trim-handle-right" onMouseDown={(e) => onTrimMouseDown(e, clip, 'right')} />
    </div>
  );
}

// ─── Audio shadow element (for video clips) ───────────────────
export function AudioShadowElement({ clip, dur, leftPx, widthPx }: { clip: TimelineClip; dur: number; leftPx: number; widthPx: number }) {
  const samples = useAudioWaveform(clip.file_path, clip.start_time, dur);
  return (
    <div
      className="clip-block audio-shadow"
      style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
    >
      {samples && (
        <div className="clip-waveform-wrap" style={{ opacity: 0.4 }}>
          <AudioWaveform
            samples={samples}
            width={widthPx}
            height={AUDIO_H * 0.6}
            color="#10b981"
          />
        </div>
      )}
    </div>
  );
}
