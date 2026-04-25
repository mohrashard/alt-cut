import {
  useState, useRef, useCallback, useEffect, useMemo
} from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { TimelineClip } from '../lib/db';

// ─── Constants ────────────────────────────────────────────────
const DEFAULT_PPS       = 80;        // pixels per second (default zoom)
const MIN_PPS           = 20;
const MAX_PPS           = 600;
const RULER_HEIGHT      = 24;
const TRACK_VIDEO_H     = 56;
const TRACK_AUDIO_H     = 40;
const TRACK_TEXT_H      = 34;
const SNAP_THRESHOLD_PX = 10;        // px within which snapping activates

// ─── Types ────────────────────────────────────────────────────
interface TimelineProps {
  clips: TimelineClip[];
  videoDuration: number;
  selectedClipId: number | null;
  playheadSeconds: number;
  onClipSelected: (id: number | null) => void;
  onPlayheadChange: (t: number) => void;
  onTimelineChange: () => void;
}

// ─── Icon helpers ─────────────────────────────────────────────
const ScissorIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
    <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
    <line x1="8.12" y1="8.12" x2="12" y2="12"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const ZoomInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);
const ZoomOutIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);
const MagnetIcon = ({ active }: { active: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 15A6 6 0 0 0 6 3"/><path d="M18 15A6 6 0 0 0 18 3"/>
    <line x1="6" y1="3" x2="18" y2="3"/><line x1="6" y1="21" x2="6" y2="15"/>
    <line x1="18" y1="21" x2="18" y2="15"/>
  </svg>
);

// ─── Time formatting ──────────────────────────────────────────
const fmt = (s: number) => {
  const m  = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${ms}`;
};

// ─── Ruler tick generator ─────────────────────────────────────
function getRulerTicks(pps: number, totalDur: number) {
  // Choose a nice interval based on zoom
  const intervals = [0.1, 0.5, 1, 2, 5, 10, 30, 60];
  const targetPx  = 80; // min px between labels
  const interval  = intervals.find(i => i * pps >= targetPx) ?? 60;

  const ticks: { t: number; major: boolean }[] = [];
  const count = Math.ceil(totalDur / interval) + 2;
  for (let i = 0; i <= count; i++) {
    const t = i * interval;
    ticks.push({ t, major: true });
    // minor ticks every 1/5 of interval
    if (interval >= 1) {
      for (let j = 1; j < 5; j++) {
        const mt = t + (j * interval) / 5;
        if (mt < totalDur + interval) ticks.push({ t: mt, major: false });
      }
    }
  }
  return { ticks, interval };
}

// ─── Main Component ───────────────────────────────────────────
export function Timeline({
  clips,
  videoDuration,
  selectedClipId,
  playheadSeconds,
  onClipSelected,
  onPlayheadChange,
  onTimelineChange,
}: TimelineProps) {
  const { setNodeRef: setVideoDropRef, isOver: isVideoOver } = useDroppable({ id: 'timeline-droppable' });
  const { setNodeRef: setAudioDropRef, isOver: isAudioOver } = useDroppable({ id: 'timeline-audio-droppable' });

  const [pps, setPps] = useState(DEFAULT_PPS);            // pixels per second
  const [magnetOn, setMagnetOn] = useState(true);
  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: number } | null>(null);

  // Trim drag state
  const [trimState, setTrimState] = useState<{
    clipId: number;
    edge: 'left' | 'right';
    startMouseX: number;
    origStart: number;
    origEnd: number;
    origTimelineStart: number;
    currentStart: number;
    currentEnd: number;
    currentTimelineStart: number;
  } | null>(null);

  // Clip drag/reorder state
  const [dragClip, setDragClip] = useState<{
    clipId: number;
    startMouseX: number;
    origTimelineStart: number;
    currentTimelineStart: number;
  } | null>(null);

  const tracksRef   = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef(false);

  const totalDur   = Math.max(videoDuration, 10);
  const totalWidth = totalDur * pps + 400; // extra padding

  // ── Grouped clips by track ───────────────────────────────
  const videoClips   = useMemo(() => clips.filter(c => !c.track_type || c.track_type === 'video'), [clips]);
  const audioClips   = useMemo(() => clips.filter(c => c.track_type === 'audio'), [clips]);
  const textClips    = useMemo(() => clips.filter(c => c.track_type === 'text'), [clips]);

  // ── Snap targets (all clip edges + playhead) ─────────────
  const snapTargets = useMemo(() => {
    const targets: number[] = [playheadSeconds];
    for (const c of clips) {
      targets.push(c.timeline_start);
      targets.push(c.timeline_start + (c.end_time - c.start_time));
    }
    return targets;
  }, [clips, playheadSeconds]);

  const snapSeconds = useCallback((rawSec: number) => {
    if (!magnetOn) return rawSec;
    for (const t of snapTargets) {
      if (Math.abs((rawSec - t) * pps) <= SNAP_THRESHOLD_PX) {
        setSnapGuideX(t * pps);
        return t;
      }
    }
    setSnapGuideX(null);
    return rawSec;
  }, [magnetOn, snapTargets, pps]);

  // ── Playhead drag ────────────────────────────────────────
  const onPlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDraggingPlayhead.current = true;
    document.addEventListener('mousemove', onPlayheadDrag);
    document.addEventListener('mouseup', onPlayheadRelease, { once: true });
  };

  const onPlayheadDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingPlayhead.current || !tracksRef.current) return;
    const rect  = tracksRef.current.getBoundingClientRect();
    const scrollLeft = tracksRef.current.scrollLeft;
    const rawPx  = e.clientX - rect.left + scrollLeft;
    const rawSec = Math.max(0, Math.min(rawPx / pps, totalDur));
    onPlayheadChange(snapSeconds(rawSec));
  }, [pps, totalDur, snapSeconds, onPlayheadChange]);

  const onPlayheadRelease = useCallback(() => {
    isDraggingPlayhead.current = false;
    setSnapGuideX(null);
    document.removeEventListener('mousemove', onPlayheadDrag);
  }, [onPlayheadDrag]);

  // ── Ruler click to seek ──────────────────────────────────
  const onRulerClick = (e: React.MouseEvent) => {
    if (!tracksRef.current) return;
    const rect = tracksRef.current.getBoundingClientRect();
    const scrollLeft = tracksRef.current.scrollLeft;
    const rawPx  = e.clientX - rect.left + scrollLeft;
    const rawSec = Math.max(0, Math.min(rawPx / pps, totalDur));
    onPlayheadChange(rawSec);
  };

  // ── Scroll-wheel zoom ────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setPps(prev => Math.min(MAX_PPS, Math.max(MIN_PPS, prev * factor)));
    }
  };

  // ── Trim handle drag ─────────────────────────────────────
  const onTrimMouseDown = (
    e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right'
  ) => {
    e.stopPropagation();
    setTrimState({
      clipId: clip.id,
      edge,
      startMouseX: e.clientX,
      origStart: clip.start_time,
      origEnd: clip.end_time,
      origTimelineStart: clip.timeline_start,
      currentStart: clip.start_time,
      currentEnd: clip.end_time,
      currentTimelineStart: clip.timeline_start,
    });
    document.addEventListener('mousemove', onTrimDrag);
    document.addEventListener('mouseup', onTrimRelease, { once: true });
  };

  const onTrimDrag = useCallback((e: MouseEvent) => {
    if (!trimState) return;
    
    // Find the max duration of the asset. We don't have the asset here, but we can assume max duration is large, 
    // or we can bound it loosely. Actually, start_time >= 0, and end_time >= start_time + 0.1
    const deltaPx = e.clientX - trimState.startMouseX;
    const deltaSec = deltaPx / pps;
    
    setTrimState(prev => {
      if (!prev) return null;
      let { currentStart, currentEnd, currentTimelineStart } = prev;
      
      if (prev.edge === 'left') {
        // Trimming the left edge
        // deltaSec > 0 means shrinking from left, moving start_time forward and timeline_start forward
        let newStart = prev.origStart + deltaSec;
        if (newStart < 0) newStart = 0;
        if (newStart > prev.origEnd - 0.1) newStart = prev.origEnd - 0.1; // minimum 0.1s duration
        
        currentStart = snapSeconds(newStart);
        currentTimelineStart = prev.origTimelineStart + (currentStart - prev.origStart);
      } else {
        // Trimming the right edge
        // deltaSec > 0 means growing to right, moving end_time forward
        let newEnd = prev.origEnd + deltaSec;
        if (newEnd < prev.origStart + 0.1) newEnd = prev.origStart + 0.1;
        
        currentEnd = snapSeconds(newEnd);
      }
      
      return { ...prev, currentStart, currentEnd, currentTimelineStart };
    });
  }, [trimState, pps, snapSeconds]);

  const onTrimRelease = useCallback(async () => {
    document.removeEventListener('mousemove', onTrimDrag);
    if (!trimState) return;
    const db = await import('../lib/db');
    await db.updateClipTime(trimState.clipId, trimState.currentStart, trimState.currentEnd, trimState.currentTimelineStart);
    setTrimState(null);
    setSnapGuideX(null);
    onTimelineChange();
  }, [trimState, onTrimDrag, onTimelineChange]);

  // ── Clip drag to reorder ─────────────────────────────────
  const onClipDragStart = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setDragClip({
      clipId: clip.id,
      startMouseX: e.clientX,
      origTimelineStart: clip.timeline_start,
      currentTimelineStart: clip.timeline_start,
    });
    document.addEventListener('mousemove', onClipDragging);
    document.addEventListener('mouseup', onClipDragEnd, { once: true });
  };

  const onClipDragging = useCallback(async (e: MouseEvent) => {
    if (!dragClip) return;
    const deltaPx  = e.clientX - dragClip.startMouseX;
    const deltaSec = deltaPx / pps;
    const rawSec   = Math.max(0, dragClip.origTimelineStart + deltaSec);
    const snapped = snapSeconds(rawSec); // updates snap guide visually
    setDragClip(prev => prev ? { ...prev, currentTimelineStart: snapped } : null);
  }, [dragClip, pps, snapSeconds]);

  const onClipDragEnd = useCallback(async (e: MouseEvent) => {
    document.removeEventListener('mousemove', onClipDragging);
    if (!dragClip) return;
    const deltaPx  = e.clientX - dragClip.startMouseX;
    const deltaSec = deltaPx / pps;
    const rawSec   = Math.max(0, dragClip.origTimelineStart + deltaSec);
    const snapped  = snapSeconds(rawSec);

    const db = await import('../lib/db');
    const clip = clips.find(c => c.id === dragClip.clipId);
    if (clip) {
      await db.updateClipTime(clip.id, clip.start_time, clip.end_time, snapped);
    }

    setDragClip(null);
    setSnapGuideX(null);
    onTimelineChange();
  }, [dragClip, pps, snapSeconds, clips, onTimelineChange]);

  // ── Split ────────────────────────────────────────────────
  const handleSplit = async () => {
    if (selectedClipId === null) return;
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const dur = clip.end_time - clip.start_time;
    const localT = playheadSeconds - clip.timeline_start;
    if (localT <= 0 || localT >= dur) {
      alert(`Playhead must be inside the selected clip.\n(Move the playhead between ${fmt(clip.timeline_start)} and ${fmt(clip.timeline_start + dur)})`);
      return;
    }
    const db = await import('../lib/db');
    await db.splitClip(selectedClipId, playheadSeconds);
    onClipSelected(null);
    onTimelineChange();
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async (clipId?: number) => {
    const id = clipId ?? selectedClipId;
    if (id === null || id === undefined) return;
    const db = await import('../lib/db');
    await db.deleteTimelineClip(id);
    onClipSelected(null);
    setContextMenu(null);
    onTimelineChange();
  };

  // ── Context menu ─────────────────────────────────────────
  const onClipRightClick = (e: React.MouseEvent, clipId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 's' || e.key === 'S') handleSplit();
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
      if (e.key === '+' || e.key === '=') setPps(p => Math.min(MAX_PPS, p * 1.25));
      if (e.key === '-') setPps(p => Math.max(MIN_PPS, p * 0.8));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClipId, playheadSeconds, clips]);

  // ── Ruler ticks ──────────────────────────────────────────
  const { ticks } = getRulerTicks(pps, totalDur);

  // ── Playhead x position ──────────────────────────────────
  const playheadX = playheadSeconds * pps;

  // ── Selected clip validation for split ──────────────────
  const selectedClip = clips.find(c => c.id === selectedClipId);
  const canSplit = selectedClip
    ? playheadSeconds > selectedClip.timeline_start &&
      playheadSeconds < selectedClip.timeline_start + (selectedClip.end_time - selectedClip.start_time)
    : false;

  // ── Render clip block ────────────────────────────────────
  const renderClip = (clip: TimelineClip, trackType: 'video' | 'audio' | 'text') => {
    let dur = clip.end_time - clip.start_time;
    let tStart = clip.timeline_start;
    
    if (trimState?.clipId === clip.id) {
      dur = trimState.currentEnd - trimState.currentStart;
      tStart = trimState.currentTimelineStart;
    } else if (dragClip?.clipId === clip.id) {
      tStart = dragClip.currentTimelineStart;
    }

    const leftPx   = tStart * pps;
    const widthPx  = Math.max(dur * pps, 8);
    const isSel    = clip.id === selectedClipId;
    const isBusy   = clip.ai_metadata?.['captions']?.status === 'processing' ||
                     clip.ai_metadata?.['denoise']?.status === 'processing';
    const isDragging = dragClip?.clipId === clip.id;

    const label = clip.file_path?.split(/[/\\]/).pop() ?? '';
    const shortLabel = dur < 2 ? '' : label;

    return (
      <div
        key={clip.id}
        className={`clip-block ${trackType} ${isSel ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
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
  };

  return (
    <div className="timeline-section" onWheel={onWheel}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="timeline-toolbar">
        <div className="timeline-tools-left">
          <button className="tl-btn" title="Undo (Ctrl+Z)">↩</button>
          <button className="tl-btn" title="Redo (Ctrl+Y)">↪</button>
          <div className="tl-divider" />
          <button
            className={`tl-btn tl-btn-text ${canSplit ? '' : ''}`}
            disabled={!canSplit}
            title="Split at playhead (S)"
            onClick={handleSplit}
          >
            <ScissorIcon /> Split
          </button>
          <button
            className="tl-btn tl-btn-text"
            disabled={selectedClipId === null}
            title="Delete selected (Delete)"
            onClick={() => handleDelete()}
          >
            <TrashIcon /> Delete
          </button>
          <div className="tl-divider" />
          {/* Magnet toggle */}
          <button
            className={`tl-btn tl-btn-text ${magnetOn ? 'tl-btn-active' : ''}`}
            title="Toggle magnet snap (M)"
            onClick={() => setMagnetOn(m => !m)}
          >
            <MagnetIcon active={magnetOn} />
            Magnet
          </button>
        </div>

        {/* Right: zoom + timecode */}
        <div className="timeline-tools-right">
          <button className="tl-btn" title="Zoom out (-)" onClick={() => setPps(p => Math.max(MIN_PPS, p * 0.75))}>
            <ZoomOutIcon />
          </button>
          <input
            type="range" min={MIN_PPS} max={MAX_PPS} value={pps}
            onChange={e => setPps(Number(e.target.value))}
            className="tl-zoom-slider"
            title="Zoom"
          />
          <button className="tl-btn" title="Zoom in (+)" onClick={() => setPps(p => Math.min(MAX_PPS, p * 1.33))}>
            <ZoomInIcon />
          </button>
          <div className="tl-divider" />
          <span className="tl-timecode">
            {fmt(playheadSeconds)} / {fmt(videoDuration)}
          </span>
        </div>
      </div>

      {/* ── Timeline body ────────────────────────────────── */}
      <div className="timeline-body">

        {/* Track labels */}
        <div className="timeline-track-labels">
          <div className="tl-ruler-spacer" style={{ height: RULER_HEIGHT }} />
          {textClips.length > 0 && (
            <div className="track-label text-track" style={{ height: TRACK_TEXT_H }}>
              <span>TEXT</span>
            </div>
          )}
          <div className="track-label caption-track" style={{ height: TRACK_TEXT_H }}>
            <span>CAPTION</span>
          </div>
          <div className="track-label video-track" style={{ height: TRACK_VIDEO_H }}>
            <span>VIDEO</span>
          </div>
          <div className="track-label audio-track" style={{ height: TRACK_AUDIO_H }}>
            <span>AUDIO</span>
          </div>
        </div>

        {/* Scrollable tracks area */}
        <div
          className="timeline-tracks"
          ref={tracksRef}
          onClick={() => onClipSelected(null)}
        >
          {/* Inner scroll container */}
          <div style={{ width: totalWidth, position: 'relative', minHeight: '100%' }}>

            {/* ── Ruler ──────────────────────────────────── */}
            <div
              className="timeline-ruler"
              style={{ height: RULER_HEIGHT, width: totalWidth }}
              onMouseDown={onRulerClick}
            >
              {ticks.filter(t => t.major).map(({ t }) => (
                <div
                  key={t}
                  className="ruler-tick"
                  style={{ left: t * pps }}
                >
                  <span className="ruler-label">{fmt(t)}</span>
                  <div className="ruler-tick-line major" />
                </div>
              ))}
              {ticks.filter(t => !t.major).map(({ t }, i) => (
                <div
                  key={`m${i}`}
                  className="ruler-tick"
                  style={{ left: t * pps }}
                >
                  <div className="ruler-tick-line minor" />
                </div>
              ))}
            </div>

            {/* ── Playhead line (spans all tracks) ──────── */}
            <div
              className="playhead-line"
              style={{ left: playheadX }}
            >
              <div
                className="playhead-head"
                onMouseDown={onPlayheadMouseDown}
              />
            </div>

            {/* ── Snap guide ────────────────────────────── */}
            {snapGuideX !== null && (
              <div className="snap-guide" style={{ left: snapGuideX }} />
            )}

            {/* ── Text track ────────────────────────────── */}
            {textClips.length > 0 && (
              <div className="track-row text-track" style={{ height: TRACK_TEXT_H }}>
                {textClips.map(c => renderClip(c, 'text'))}
              </div>
            )}

            {/* ── Caption track (always visible) ────────── */}
            <div
              className="track-row caption-track"
              style={{ height: TRACK_TEXT_H }}
            >
              {/* Caption clips auto-injected by PropertiesPanel */}
            </div>

            {/* ── Video track ───────────────────────────── */}
            <div
              ref={setVideoDropRef}
              className={`track-row video-track ${isVideoOver ? 'is-over' : ''}`}
              style={{ height: TRACK_VIDEO_H }}
            >
              {videoClips.length === 0 && (
                <div className="empty-timeline-hint">
                  <span>📦</span>
                  <span>Drag video here to start</span>
                </div>
              )}
              {videoClips.map(c => renderClip(c, 'video'))}
            </div>

            {/* ── Audio track ───────────────────────────── */}
            <div
              ref={setAudioDropRef}
              className={`track-row audio-track ${isAudioOver ? 'is-over' : ''}`}
              style={{ height: TRACK_AUDIO_H }}
            >
              {audioClips.length === 0 && (
                <div className="empty-timeline-hint" style={{ fontSize: '10px' }}>
                  <span>🎵</span>
                  <span>Drag audio here</span>
                </div>
              )}
              {audioClips.map(c => renderClip(c, 'audio'))}
              {/* Audio shadow from video clips */}
              {videoClips.map(clip => {
                const dur    = clip.end_time - clip.start_time;
                const leftPx = clip.timeline_start * pps;
                const widthPx = Math.max(dur * pps, 8);
                return (
                  <div
                    key={`va-${clip.id}`}
                    className="clip-block audio-shadow"
                    style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
                  />
                );
              })}
            </div>

          </div>
        </div>
      </div>

      {/* ── Context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => handleDelete(contextMenu.clipId)}>
            🗑️ Delete
          </button>
          <button onClick={async () => {
            const clip = clips.find(c => c.id === contextMenu.clipId);
            if (clip) {
              const db = await import('../lib/db');
              await db.addClipToTimeline(
                clip.project_id, clip.asset_id,
                clip.end_time - clip.start_time,
                clip.track_type || 'video', clip.track_lane ?? 0
              );
              setContextMenu(null);
              onTimelineChange();
            }
          }}>
            📋 Duplicate
          </button>
        </div>
      )}
    </div>
  );
}
