import type { TimelineClip } from '../../lib/db';
import { fmt } from './utils';
import { useVideoThumbnail } from './hooks/use-video-thumbnail';
import { useAudioWaveform } from './hooks/use-audio-waveform';
import { AudioWaveform } from './audio-waveform';
import { AudioVolumeLine } from './audio-volume-line';

// Track heights (must match constants.ts + CSS)
const VIDEO_H = 56;
const AUDIO_H = 40;
const THUMB_ASPECT = 16 / 9;

// CapCut palette
const AUDIO_TRACK_COLOR = '#0d9669';   // dark emerald track background
const AUDIO_BAR_COLOR = 'rgba(255,255,255,0.92)'; // white waveform bars

interface TrimState {
  clipId: number;
  currentStart: number;
  currentEnd: number;
  currentTimelineStart: number;
}

import { type DragClipState } from './constants';

interface TimelineElementProps {
  clip: TimelineClip;
  trackType: 'video' | 'audio' | 'text';
  pps: number;
  isSelected: boolean;
  trimState: TrimState | null;
  dragClip: DragClipState | null;
  onClipSelected: (e: React.MouseEvent, id: number) => void;
  onClipDragStart: (e: React.MouseEvent, clip: TimelineClip) => void;
  onClipOptionsClick: (e: React.MouseEvent, clipId: number) => void;
  onTrimMouseDown: (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => void;
  onVolumeChange: (clipId: number, volume: number) => void;
  onVolumeDragEnd: (clipId: number, volume: number) => void;
}

// ─── Video thumbnail background ───────────────────────────────
function VideoContent({ clip, dur }: { clip: TimelineClip; dur: number }) {
  const thumbnail = useVideoThumbnail(clip.file_path, clip.start_time);
  const tileW = Math.round(VIDEO_H * THUMB_ASPECT);
  const label = clip.file_path?.split(/[/\\]/).pop() ?? '';

  return (
    <>
      {thumbnail && (
        <div
          className="clip-thumb-bg"
          style={{
            backgroundImage: `url(${thumbnail})`,
            backgroundSize: `${tileW}px ${VIDEO_H * 0.8}px`,
          }}
        />
      )}
      <div className="clip-thumb-header">
        {dur >= 2 && <span className="clip-thumb-name">{label}</span>}
        <span className="clip-dur clip-thumb-dur">{fmt(dur)}</span>
      </div>
    </>
  );
}

// ─── Shared waveform + volume line ────────────────────────────
// KEY FIX: waveHeight now = full AUDIO_H so the canvas covers the entire clip.
// The canvas itself paints the track background + white bars, matching CapCut.
// Previously the canvas was 70% height, leaving the bottom area as bare CSS
// background — which made it look like a flat bar with no visible waveform.
function WaveformWithVolume({
  clip,
  dur,
  widthPx,
  waveHeight,
  waveOpacity = 1,
  onVolumeChange,
  onVolumeDragEnd,
}: {
  clip: TimelineClip;
  dur: number;
  widthPx: number;
  waveHeight: number;
  waveOpacity?: number;
  onVolumeChange: (clipId: number, volume: number) => void;
  onVolumeDragEnd: (clipId: number, volume: number) => void;
}) {
  const samples = useAudioWaveform(clip.file_path, clip.start_time, dur);

  // KEY FIX: render the canvas even when samples === null.
  // Previously returning null here meant the clip showed ONLY the CSS
  // background color (flat green bar) with no canvas at all until decode
  // finished. Now the canvas renders immediately with a placeholder flat line,
  // then updates in-place when samples arrive — no layout shift.
  return (
    <>
      <div
        className="clip-waveform-wrap"
        style={{
          position: 'absolute',
          inset: 0,
          ...(waveOpacity < 1 ? { opacity: waveOpacity } : {}),
        }}
      >
        <AudioWaveform
          samples={samples}        // null → canvas draws flat placeholder line
          width={widthPx}
          height={waveHeight}
          trackColor={AUDIO_TRACK_COLOR}
          barColor={AUDIO_BAR_COLOR}
        />
      </div>
      <AudioVolumeLine
        volume={clip.audio_volume ?? 1.0}
        onChange={(vol) => onVolumeChange(clip.id, vol)}
        onDragEnd={(vol) => onVolumeDragEnd(clip.id, vol)}
      />
    </>
  );
}

// ─── Audio waveform content ───────────────────────────────────
function AudioContent({
  clip,
  dur,
  widthPx,
  onVolumeChange,
  onVolumeDragEnd,
}: {
  clip: TimelineClip;
  dur: number;
  widthPx: number;
  onVolumeChange: (clipId: number, volume: number) => void;
  onVolumeDragEnd: (clipId: number, volume: number) => void;
}) {
  const isMuted = clip.audio_enabled === 0;
  const label = clip.file_path?.split(/[/\\]/).pop() ?? '';

  return (
    <>
      {!isMuted && (
        <WaveformWithVolume
          clip={clip}
          dur={dur}
          widthPx={widthPx}
          waveHeight={AUDIO_H}   // FIX: was AUDIO_H * 0.7 — now fills full clip height
          onVolumeChange={onVolumeChange}
          onVolumeDragEnd={onVolumeDragEnd}
        />
      )}
      {/* Label overlaid on top of canvas, so it's always readable */}
      <div className="clip-label" style={{ position: 'relative', zIndex: 1 }}>
        {isMuted && <span style={{ marginRight: 4 }}>🔇</span>}
        {dur >= 2 && <span>{label}</span>}
      </div>
    </>
  );
}

// ─── Text / caption content ───────────────────────────────────
function TextContent({ clip }: { clip: TimelineClip }) {
  let label = 'Text';

  if (clip.file_path?.startsWith('text://')) {
    try {
      // Extract the JSON payload after 'text://'
      const jsonPayload = clip.file_path.substring(7);
      const data = JSON.parse(jsonPayload);
      // Grab the raw text to display in the block
      label = data.text || 'Text';
    } catch (e) {
      // Fallback if it's raw text rather than JSON
      label = clip.file_path.substring(7);
    }
  } else if (clip.file_path) {
    // Standard file path fallback (for imported SRTs, etc.)
    label = clip.file_path.split(/[/\\]/).pop() ?? 'Text';
  }

  return (
    <div className="clip-label" style={{
      padding: '0 8px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      width: '100%',
      fontWeight: 600
    }}>
      <span>{label}</span>
    </div>
  );
}

// ─── Main element ─────────────────────────────────────────────
export function TimelineElement({
  clip,
  trackType,
  pps,
  isSelected,
  trimState,
  dragClip,
  onClipSelected,
  onClipDragStart,
  onClipOptionsClick,
  onTrimMouseDown,
  onVolumeChange,
  onVolumeDragEnd,
}: TimelineElementProps) {
  let dur = clip.end_time - clip.start_time;
  let tStart = clip.timeline_start;

  if (trimState?.clipId === clip.id) {
    dur = trimState.currentEnd - trimState.currentStart;
    tStart = trimState.currentTimelineStart;
  } else if (dragClip?.offsets[clip.id]) {
    tStart = dragClip.offsets[clip.id].currentTimelineStart;
  }

  const leftPx = tStart * pps;
  const widthPx = Math.max(dur * pps, 8);
  const isHidden = clip.hidden === 1;

  // Covers any AI feature — not just hardcoded 'captions'/'denoise'
  const isBusy =
    clip.ai_metadata != null &&
    Object.values(clip.ai_metadata).some(
      (v) => v != null && typeof v === 'object' && 'status' in v && v.status === 'processing',
    );

  const isDragging = !!dragClip?.offsets[clip.id];
  const isMuted = clip.audio_enabled === 0;
  const label = clip.file_path?.split(/[/\\]/).pop() ?? '';

  return (
    <div
      className={[
        'clip-block',
        trackType,
        isSelected ? 'selected' : '',
        isDragging ? 'dragging' : '',
        isMuted ? 'muted' : '',
        isHidden ? 'clip-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: leftPx,
        width: widthPx,
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
      }}
      onClick={(e) => { e.stopPropagation(); onClipSelected(e, clip.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onClipOptionsClick(e, clip.id); }}
      onMouseDown={(e) => { if (e.button === 0) onClipDragStart(e, clip); }}
      onMouseUp={(e) => { e.stopPropagation(); }}
      onContextMenu={(e) => onClipOptionsClick(e, clip.id)}
      title={`${label}\n${fmt(tStart)} → ${fmt(tStart + dur)}`}
    >
      <button
        className="tl-clip-opts-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClipOptionsClick(e, clip.id);
        }}
        title="Clip Options"
      >
        ⋯
      </button>

      <div className="trim-handle trim-handle-left" onMouseDown={(e) => onTrimMouseDown(e, clip, 'left')} />

      {trackType === 'video' && <VideoContent clip={clip} dur={dur} />}
      {trackType === 'audio' && (
        <AudioContent
          clip={clip}
          dur={dur}
          widthPx={widthPx}
          onVolumeChange={onVolumeChange}
          onVolumeDragEnd={onVolumeDragEnd}
        />
      )}
      {trackType === 'text' && <TextContent clip={clip} />}

      {isBusy && <span className="clip-busy-spin">⚙️</span>}

      <div className="trim-handle trim-handle-right" onMouseDown={(e) => onTrimMouseDown(e, clip, 'right')} />
    </div>
  );
}

// ─── Audio shadow element (for video clips with detached audio track) ────────
export function AudioShadowElement({
  clip,
  dur,
  leftPx,
  widthPx,
  onVolumeChange,
  onVolumeDragEnd,
}: {
  clip: TimelineClip;
  dur: number;
  leftPx: number;
  widthPx: number;
  onVolumeChange: (clipId: number, volume: number) => void;
  onVolumeDragEnd: (clipId: number, volume: number) => void;
}) {
  const isMuted = clip.audio_enabled === 0;

  return (
    <div
      className="clip-block audio-shadow"
      style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
    >
      {!isMuted && (
        <WaveformWithVolume
          clip={clip}
          dur={dur}
          widthPx={widthPx}
          waveHeight={AUDIO_H}
          waveOpacity={0.5}
          onVolumeChange={onVolumeChange}
          onVolumeDragEnd={onVolumeDragEnd}
        />
      )}
    </div>
  );
}