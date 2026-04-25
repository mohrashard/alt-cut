import {
  useState, useRef, useCallback, useEffect, useMemo
} from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { TimelineClip } from '../../lib/db';
import { TimelinePlayhead } from '../TimelinePlayhead';
import {
  DEFAULT_PPS, MIN_PPS, MAX_PPS,
  TRACK_VIDEO_H, TRACK_AUDIO_H, TRACK_TEXT_H, SNAP_THRESHOLD_PX,
  type TrackState, type TimelineProps,
} from './constants';
import { fmt, getRulerTicks } from './utils';
import { TimelineRuler } from './timeline-ruler';
import { SnapIndicator } from './snap-indicator';
import { TimelineElement } from './timeline-element';
import { TimelineToolbar } from './timeline-toolbar';
import { TimelineTrackLabels } from './timeline-track';

export function Timeline({
  clips, videoDuration, selectedClipId, playheadSeconds,
  onClipSelected, onPlayheadChange, onTimelineChange, onBeforeChange,
  canUndo, canRedo, onUndo, onRedo,
  markers, projectId, onMarkersChange,
  playheadDomRef, onPpsChange, timecodeDomRef,
}: TimelineProps) {
  const { setNodeRef: setVideoDropRef, isOver: isVideoOver } = useDroppable({ id: 'timeline-droppable' });
  const { setNodeRef: setAudioDropRef, isOver: isAudioOver } = useDroppable({ id: 'timeline-audio-droppable' });

  const [pps, setPps] = useState(DEFAULT_PPS);
  const [magnetOn, setMagnetOn] = useState(true);
  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: number } | null>(null);
  const [markerCtxMenu, setMarkerCtxMenu] = useState<{ x: number; y: number; markerId: number } | null>(null);
  const [openTrackMenu, setOpenTrackMenu] = useState<string | null>(null);
  const [trackStates, setTrackStates] = useState<Record<string, TrackState>>({
    video:   { locked: false, hidden: false, muted: false },
    audio:   { locked: false, hidden: false, muted: false },
    text:    { locked: false, hidden: false, muted: false },
    caption: { locked: false, hidden: false, muted: false },
  });

  const [trimState, setTrimState] = useState<{
    clipId: number; edge: 'left' | 'right';
    startMouseX: number; origStart: number; origEnd: number;
    origTimelineStart: number; currentStart: number;
    currentEnd: number; currentTimelineStart: number;
  } | null>(null);

  const [dragClip, setDragClip] = useState<{
    clipId: number; startMouseX: number;
    origTimelineStart: number; currentTimelineStart: number;
  } | null>(null);

  const tracksRef     = useRef<HTMLDivElement>(null);
  const mouseXRef     = useRef(0);
  const isAnyDragging = trimState !== null || dragClip !== null;

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { mouseXRef.current = e.clientX; };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  // Global safety net — clears stuck snap guide if mouse is released outside the window
  useEffect(() => {
    const clearSnap = () => setSnapGuideX(null);
    document.addEventListener('mouseup', clearSnap);
    return () => document.removeEventListener('mouseup', clearSnap);
  }, []);

  // Edge auto-scroll — only runs an RAF loop while a drag is active
  useEffect(() => {
    if (!isAnyDragging) return;
    let raf: number;
    const loop = () => {
      if (tracksRef.current) {
        const rect  = tracksRef.current.getBoundingClientRect();
        const x     = mouseXRef.current - rect.left;
        const edge  = 60;
        const speed = 12;
        if (x < edge) {
          tracksRef.current.scrollLeft -= speed * (1 - Math.max(0, x) / edge);
        } else if (x > rect.width - edge) {
          tracksRef.current.scrollLeft += speed * (1 - Math.max(0, rect.width - x) / edge);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isAnyDragging]);

  const totalDur   = Math.max(videoDuration, 10);
  const totalWidth = totalDur * pps + 400;

  const handleZoom = useCallback((newPps: number | ((prev: number) => number)) => {
    setPps(oldPps => {
      const target  = typeof newPps === 'function' ? newPps(oldPps) : newPps;
      const clamped = Math.max(MIN_PPS, Math.min(MAX_PPS, target));
      if (clamped !== oldPps && tracksRef.current) {
        const diffPx = playheadSeconds * (clamped - oldPps);
        tracksRef.current.scrollLeft += diffPx;
      }
      onPpsChange?.(clamped);
      return clamped;
    });
  }, [playheadSeconds, onPpsChange]);

  const videoClips = useMemo(() => clips.filter(c => !c.track_type || c.track_type === 'video'), [clips]);
  const audioClips = useMemo(() => clips.filter(c => c.track_type === 'audio'), [clips]);
  const textClips  = useMemo(() => clips.filter(c => c.track_type === 'text'), [clips]);

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

  const onRulerClick = (e: React.MouseEvent) => {
    if (!tracksRef.current) return;
    const rect   = tracksRef.current.getBoundingClientRect();
    const rawPx  = e.clientX - rect.left + tracksRef.current.scrollLeft;
    const rawSec = Math.max(0, Math.min(rawPx / pps, totalDur));
    onPlayheadChange(rawSec);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setPps(prev => {
        const next = Math.min(MAX_PPS, Math.max(MIN_PPS, prev * factor));
        onPpsChange?.(next);
        return next;
      });
    }
  };

  const onTrimMouseDown = (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => {
    e.stopPropagation();
    setTrimState({
      clipId: clip.id, edge, startMouseX: e.clientX,
      origStart: clip.start_time, origEnd: clip.end_time,
      origTimelineStart: clip.timeline_start,
      currentStart: clip.start_time, currentEnd: clip.end_time,
      currentTimelineStart: clip.timeline_start,
    });
    document.addEventListener('mousemove', onTrimDrag);
    document.addEventListener('mouseup', onTrimRelease, { once: true });
  };

  const onTrimDrag = useCallback((e: MouseEvent) => {
    if (!trimState) return;
    const deltaPx  = e.clientX - trimState.startMouseX;
    const deltaSec = deltaPx / pps;
    setTrimState(prev => {
      if (!prev) return null;
      let { currentStart, currentEnd, currentTimelineStart } = prev;
      if (prev.edge === 'left') {
        let newStart = prev.origStart + deltaSec;
        if (newStart < 0) newStart = 0;
        if (newStart > prev.origEnd - 0.1) newStart = prev.origEnd - 0.1;
        currentStart = snapSeconds(newStart);
        currentTimelineStart = prev.origTimelineStart + (currentStart - prev.origStart);
      } else {
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
    const db = await import('../../lib/db');
    await db.updateClipTime(trimState.clipId, trimState.currentStart, trimState.currentEnd, trimState.currentTimelineStart);
    setTrimState(null);
    setSnapGuideX(null);
    onTimelineChange();
  }, [trimState, onTrimDrag, onTimelineChange]);

  const onClipDragStart = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setDragClip({ clipId: clip.id, startMouseX: e.clientX, origTimelineStart: clip.timeline_start, currentTimelineStart: clip.timeline_start });
    document.addEventListener('mousemove', onClipDragging);
    document.addEventListener('mouseup', onClipDragEnd, { once: true });
  };

  const onClipDragging = useCallback(async (e: MouseEvent) => {
    if (!dragClip) return;
    const deltaPx  = e.clientX - dragClip.startMouseX;
    const deltaSec = deltaPx / pps;
    const rawSec   = Math.max(0, dragClip.origTimelineStart + deltaSec);
    const snapped  = snapSeconds(rawSec);
    setDragClip(prev => prev ? { ...prev, currentTimelineStart: snapped } : null);
  }, [dragClip, pps, snapSeconds]);

  const onClipDragEnd = useCallback(async (_e: MouseEvent) => {
    document.removeEventListener('mousemove', onClipDragging);
    if (!dragClip) return;
    const snapped = dragClip.currentTimelineStart;
    const db      = await import('../../lib/db');
    const clip    = clips.find(c => c.id === dragClip.clipId);
    if (clip) {
      onBeforeChange();
      await db.updateClipTime(clip.id, clip.start_time, clip.end_time, snapped);
    }
    setDragClip(null);
    setSnapGuideX(null);
    onTimelineChange();
  }, [dragClip, pps, snapSeconds, clips, onTimelineChange, onBeforeChange]);

  const handleSplit = async () => {
    if (selectedClipId === null) return;
    const clip   = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const dur    = clip.end_time - clip.start_time;
    const localT = playheadSeconds - clip.timeline_start;
    if (localT <= 0 || localT >= dur) { alert('Playhead must be inside the selected clip.'); return; }
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.splitClip(selectedClipId, playheadSeconds);
    onClipSelected(null);
    onTimelineChange();
  };

  const handleDelete = async (clipId?: number) => {
    const id = clipId ?? selectedClipId;
    if (id === null || id === undefined) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.deleteTimelineClip(id);
    onClipSelected(null);
    setContextMenu(null);
    onTimelineChange();
  };

  const handleDeleteLeft = async () => {
    if (selectedClipId === null) return;
    const clip   = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const localT = playheadSeconds - clip.timeline_start;
    const dur    = clip.end_time - clip.start_time;
    if (localT <= 0 || localT >= dur) { alert('Playhead must be inside the selected clip.'); return; }
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.updateClipTime(clip.id, clip.start_time + localT, clip.end_time, playheadSeconds);
    onTimelineChange();
  };

  const handleDeleteRight = async () => {
    if (selectedClipId === null) return;
    const clip   = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const localT = playheadSeconds - clip.timeline_start;
    const dur    = clip.end_time - clip.start_time;
    if (localT <= 0 || localT >= dur) { alert('Playhead must be inside the selected clip.'); return; }
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.updateClipTime(clip.id, clip.start_time, clip.start_time + localT, clip.timeline_start);
    onTimelineChange();
  };

  const handleAddMarker = async () => {
    if (!projectId) return;
    const db = await import('../../lib/db');
    await db.addMarker(projectId, playheadSeconds);
    onMarkersChange();
  };

  const handleZoomFit = () => {
    if (!tracksRef.current || videoDuration <= 0) return;
    const w = tracksRef.current.clientWidth - 20;
    handleZoom(w / videoDuration);
  };

  const handleExtractAudio = async (clipId: number) => {
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.extractAudio(clipId);
    setContextMenu(null);
    onTimelineChange();
  };

  const handleToggleMute = async (clipId: number, currentEnabled: number) => {
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.setAudioEnabled(clipId, currentEnabled === 0);
    setContextMenu(null);
    onTimelineChange();
  };

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); onUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); onRedo(); return; }
      if (e.key === 's' || e.key === 'S') handleSplit();
      if (e.key === 'q' || e.key === 'Q') handleDeleteLeft();
      if (e.key === 'w' || e.key === 'W') handleDeleteRight();
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
      if (e.key === 'm' || e.key === 'M') handleAddMarker();
      if (e.key === '+' || e.key === '=') handleZoom(p => p * 1.25);
      if (e.key === '-') handleZoom(p => p * 0.8);
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPlayheadChange(Math.max(0, playheadSeconds - 1 / 30)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onPlayheadChange(Math.min(videoDuration, playheadSeconds + 1 / 30)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClipId, playheadSeconds, clips, onUndo, onRedo, videoDuration, onPlayheadChange]);

  const { ticks }   = getRulerTicks(pps, totalDur);
  const playheadX   = playheadSeconds * pps;
  const selectedClip = clips.find(c => c.id === selectedClipId);
  const canSplit = selectedClip
    ? playheadSeconds > selectedClip.timeline_start &&
      playheadSeconds < selectedClip.timeline_start + (selectedClip.end_time - selectedClip.start_time)
    : false;

  const elementProps = { pps, selectedClipId, trimState, dragClip, onClipSelected, onClipDragStart, onClipRightClick, onTrimMouseDown };

  return (
    <div className="timeline-section" onWheel={onWheel}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <TimelineToolbar
        canUndo={canUndo} canRedo={canRedo} canSplit={canSplit}
        selectedClipId={selectedClipId} magnetOn={magnetOn}
        pps={pps} playheadSeconds={playheadSeconds} videoDuration={videoDuration}
        timecodeDomRef={timecodeDomRef}
        onUndo={onUndo} onRedo={onRedo} onSplit={handleSplit}
        onDeleteLeft={handleDeleteLeft} onDeleteRight={handleDeleteRight}
        onDelete={handleDelete} onAddMarker={handleAddMarker}
        onToggleMagnet={() => setMagnetOn(m => !m)}
        onZoomFit={handleZoomFit}
        onZoomOut={() => handleZoom(p => p * 0.75)}
        onZoomIn={() => handleZoom(p => p * 1.33)}
        onZoomSlider={(v) => handleZoom(v)}
      />

      {/* ── Timeline body ────────────────────────────────── */}
      <div className="timeline-body">

        {/* Track labels with ... menu */}
        <TimelineTrackLabels
          textClips={textClips} trackStates={trackStates}
          openTrackMenu={openTrackMenu}
          setOpenTrackMenu={setOpenTrackMenu}
          setTrackStates={setTrackStates}
        />

        {/* Scrollable tracks area */}
        <div className="timeline-tracks" ref={tracksRef} onClick={() => onClipSelected(null)}>
          {/* Inner scroll container */}
          <div style={{ width: totalWidth, position: 'relative', minHeight: '100%' }}>

            {/* ── Ruler ── */}
            <TimelineRuler ticks={ticks} pps={pps} totalWidth={totalWidth} onRulerClick={onRulerClick} />

            {/* ── Playhead ── */}
            {playheadDomRef && (
              <TimelinePlayhead
                initialLeftPx={playheadX} onSeek={onPlayheadChange}
                pps={pps} totalDur={totalDur} tracksScrollRef={tracksRef}
                playheadRef={playheadDomRef} onSnapGuide={setSnapGuideX}
                snapTargets={snapTargets} snapThresholdPx={SNAP_THRESHOLD_PX}
                magnetOn={magnetOn} currentTimeSec={playheadSeconds}
              />
            )}

            {/* ── Snap guide ── */}
            <SnapIndicator snapGuideX={snapGuideX} />

            {/* ── Marker lines + flags ── */}
            {markers.map(marker => (
              <div key={`ml-${marker.id}`} className="marker-line"
                style={{ left: marker.time_seconds * pps, borderColor: marker.color }}>
                <div className="marker-flag" style={{ background: marker.color }}
                  title={marker.label || fmt(marker.time_seconds)}
                  onClick={() => onPlayheadChange(marker.time_seconds)}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation();
                    setMarkerCtxMenu({ x: e.clientX, y: e.clientY, markerId: marker.id }); }} />
              </div>
            ))}

            {/* ── Text track ── */}
            {textClips.length > 0 && (
              <div className="track-row text-track" style={{ height: TRACK_TEXT_H }}>
                {textClips.map(c => <TimelineElement key={c.id} clip={c} trackType="text" {...elementProps} />)}
              </div>
            )}

            {/* ── Caption track ── */}
            <div className="track-row caption-track" style={{ height: TRACK_TEXT_H }}>
              {/* Caption clips auto-injected by PropertiesPanel */}
            </div>

            {/* ── Video track ── */}
            <div
              ref={setVideoDropRef}
              className={`track-row video-track ${isVideoOver ? 'is-over' : ''}`}
              style={{ height: TRACK_VIDEO_H }}
            >
              {videoClips.length === 0 && (
                <div className="empty-timeline-hint">
                  <span>📦</span><span>Drag video here to start</span>
                </div>
              )}
              {videoClips.map(c => <TimelineElement key={c.id} clip={c} trackType="video" {...elementProps} />)}
            </div>

            {/* ── Audio track ── */}
            <div
              ref={setAudioDropRef}
              className={`track-row audio-track ${isAudioOver ? 'is-over' : ''}`}
              style={{ height: TRACK_AUDIO_H }}
            >
              {audioClips.length === 0 && (
                <div className="empty-timeline-hint" style={{ fontSize: '10px' }}>
                  <span>🎵</span><span>Drag audio here</span>
                </div>
              )}
              {audioClips.map(c => <TimelineElement key={c.id} clip={c} trackType="audio" {...elementProps} />)}
              {/* Audio shadow from video clips */}
              {videoClips.map(clip => {
                if (clip.audio_enabled === 0) return null;
                const dur     = clip.end_time - clip.start_time;
                const leftPx  = clip.timeline_start * pps;
                const widthPx = Math.max(dur * pps, 8);
                return (
                  <div key={`va-${clip.id}`} className="clip-block audio-shadow"
                    style={{ left: leftPx, width: widthPx, position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}
                  />
                );
              })}
            </div>

          </div>
        </div>
      </div>

      {/* ── Clip context menu ── */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {(() => {
            const clip    = clips.find(c => c.id === contextMenu.clipId);
            if (!clip) return null;
            const isVideo = clip.track_type === 'video';
            const isMuted = clip.audio_enabled === 0;
            return (
              <>
                {isVideo && <button onClick={() => handleExtractAudio(clip.id)}>🎵 Extract Audio</button>}
                {isVideo && (
                  <button onClick={() => handleToggleMute(clip.id, clip.audio_enabled ?? 1)}>
                    {isMuted ? '🔊 Unmute Audio' : '🔇 Mute Audio'}
                  </button>
                )}
                <button onClick={async () => {
                  onBeforeChange();
                  const db = await import('../../lib/db');
                  await db.addClipToTimeline(clip.project_id, clip.asset_id,
                    clip.end_time - clip.start_time, clip.track_type || 'video', clip.track_lane ?? 0);
                  setContextMenu(null);
                  onTimelineChange();
                }}>📋 Duplicate</button>
                <button onClick={() => handleDelete(contextMenu.clipId)}>🗑️ Delete</button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Marker context menu ── */}
      {markerCtxMenu && (
        <div className="context-menu" style={{ top: markerCtxMenu.y, left: markerCtxMenu.x }}
          onClick={() => setMarkerCtxMenu(null)}>
          <button onClick={async () => {
            const db = await import('../../lib/db');
            await db.deleteMarker(markerCtxMenu.markerId);
            setMarkerCtxMenu(null);
            onMarkersChange();
          }}>🗑️ Delete Marker</button>
        </div>
      )}
    </div>
  );
}
