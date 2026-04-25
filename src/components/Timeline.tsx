import {
  useState, useRef, useCallback, useEffect, useMemo
} from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { TimelineClip, Marker } from '../lib/db';
import { TimelinePlayhead } from './TimelinePlayhead';

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
interface TrackState { locked: boolean; hidden: boolean; muted: boolean; }

interface TimelineProps {
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

// ─── Icon helpers ─────────────────────────────────────────────
const AddIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const SelectIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3l14 14h-7l-2.5 6L4 3z" fill="currentColor" fillOpacity="0.15"/><path d="M4 3l14 14h-7l-2.5 6L4 3z"/></svg>);
const UndoIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><polyline points="3,6 3,10 7,10"/></svg>);
const RedoIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10H11a5 5 0 0 0 0 10h4"/><polyline points="21,6 21,10 17,10"/></svg>);
const SplitIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2"/><line x1="5" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="19" y2="10"/><polyline points="8,6 12,2 16,6"/></svg>);
const DeleteLeftIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="15" y1="4" x2="15" y2="20"/><polyline points="11,8 5,12 11,16"/></svg>);
const DeleteRightIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="4" x2="9" y2="20"/><polyline points="13,8 19,12 13,16"/></svg>);
const TrashIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>);
const MarkerIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 20,8 17,19 7,19 4,8"/></svg>);
const ZoomInIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const ZoomOutIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const ZoomFitIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" opacity="0.5"/><polyline points="8,9 12,5 16,9"/><polyline points="8,15 12,19 16,15"/></svg>);
const MagnetIcon = ({ active }: { active: boolean }) => (<svg width="12" height="12" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15A6 6 0 0 0 6 3"/><path d="M18 15A6 6 0 0 0 18 3"/><line x1="6" y1="3" x2="18" y2="3"/><line x1="6" y1="21" x2="6" y2="15"/><line x1="18" y1="21" x2="18" y2="15"/></svg>);

// ─── Zoom Math ────────────────────────────────────────────────
const sliderToZoom = (pos: number) => MIN_PPS * Math.pow(MAX_PPS / MIN_PPS, pos);
const zoomToSlider = (pps: number) => Math.log(pps / MIN_PPS) / Math.log(MAX_PPS / MIN_PPS);

// ─── Time formatting ──────────────────────────────────────────
const fmt = (s: number, showDecimals: boolean = true) => {
  const m  = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  if (!showDecimals) return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
  const ms = Math.floor((s % 1) * 10);
  return `${m.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${ms}`;
};

// ─── Ruler tick generator ─────────────────────────────────────
function getRulerTicks(pps: number, totalDur: number) {
  // Choose a nice interval based on zoom
  const intervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 300, 600];
  const targetPx  = 85; // min px between labels
  const interval  = intervals.find(i => i * pps >= targetPx) ?? 600;

  const ticks: { t: number; major: boolean; label: string }[] = [];
  const count = Math.ceil(totalDur / interval) + 2;
  const showDecimals = interval < 1;

  for (let i = 0; i <= count; i++) {
    const t = i * interval;
    ticks.push({ t, major: true, label: fmt(t, showDecimals) });
    // minor ticks
    if (interval >= 0.5) {
      const minorCount = interval >= 60 ? 4 : 5; // 4 or 5 subdivisions
      for (let j = 1; j < minorCount; j++) {
        const mt = t + (j * interval) / minorCount;
        if (mt < totalDur + interval) ticks.push({ t: mt, major: false, label: '' });
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
  onBeforeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  markers,
  projectId,
  onMarkersChange,
  playheadDomRef,
  onPpsChange,
  timecodeDomRef,
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
  const mouseXRef   = useRef(0);

  // ── Edge Auto-scroll ─────────────────────────────────────
  // Only re-attach when the dragging SESSION starts/stops, not on every position update
  const isAnyDragging = isDraggingPlayhead.current || trimState !== null || dragClip !== null;
  const isAnyDraggingRef = useRef(isAnyDragging);
  isAnyDraggingRef.current = isAnyDragging;

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { mouseXRef.current = e.clientX; };
    window.addEventListener('mousemove', onMouseMove);
    let raf: number;
    const loop = () => {
      if (isAnyDraggingRef.current && tracksRef.current) {
        const rect = tracksRef.current.getBoundingClientRect();
        const x = mouseXRef.current - rect.left;
        const edge = 60;
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
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []); // mount once — reads live values via refs

  const totalDur   = Math.max(videoDuration, 10);
  const totalWidth = totalDur * pps + 400; // extra padding

  // ── Zoom Handler with scroll compensation ─────────────────
  const handleZoom = useCallback((newPps: number | ((prev: number) => number)) => {
    setPps(oldPps => {
      const target = typeof newPps === 'function' ? newPps(oldPps) : newPps;
      const clamped = Math.max(MIN_PPS, Math.min(MAX_PPS, target));
      if (clamped !== oldPps && tracksRef.current) {
        // adjust scrollLeft so the playhead stays at the exact same pixel on screen
        const diffPx = playheadSeconds * (clamped - oldPps);
        tracksRef.current.scrollLeft += diffPx;
      }
      onPpsChange?.(clamped);
      return clamped;
    });
  }, [playheadSeconds, onPpsChange]);

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
      setPps(prev => {
        const next = Math.min(MAX_PPS, Math.max(MIN_PPS, prev * factor));
        onPpsChange?.(next); // keep PreviewWindow RAF in sync
        return next;
      });
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

  const onClipDragEnd = useCallback(async (_e: MouseEvent) => {
    document.removeEventListener('mousemove', onClipDragging);
    if (!dragClip) return;
    // Use currentTimelineStart tracked live — avoids stale position when
    // auto-scroll shifted the viewport during the drag
    const snapped = dragClip.currentTimelineStart;

    const db = await import('../lib/db');
    const clip = clips.find(c => c.id === dragClip.clipId);
    if (clip) {
      onBeforeChange();
      await db.updateClipTime(clip.id, clip.start_time, clip.end_time, snapped);
    }

    setDragClip(null);
    setSnapGuideX(null);
    onTimelineChange();
  }, [dragClip, pps, snapSeconds, clips, onTimelineChange, onBeforeChange]);

  // ── Split ────────────────────────────────────────────────
  const handleSplit = async () => {
    if (selectedClipId === null) return;
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const dur = clip.end_time - clip.start_time;
    const localT = playheadSeconds - clip.timeline_start;
    if (localT <= 0 || localT >= dur) {
      alert('Playhead must be inside the selected clip.');
      return;
    }
    onBeforeChange();
    const db = await import('../lib/db');
    await db.splitClip(selectedClipId, playheadSeconds);
    onClipSelected(null);
    onTimelineChange();
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async (clipId?: number) => {
    const id = clipId ?? selectedClipId;
    if (id === null || id === undefined) return;
    onBeforeChange();
    const db = await import('../lib/db');
    await db.deleteTimelineClip(id);
    onClipSelected(null);
    setContextMenu(null);
    onTimelineChange();
  };

  const handleDeleteLeft = async () => {
    if (selectedClipId === null) return;
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const localT = playheadSeconds - clip.timeline_start;
    const dur = clip.end_time - clip.start_time;
    if (localT <= 0 || localT >= dur) { alert('Playhead must be inside the selected clip.'); return; }
    onBeforeChange();
    const db = await import('../lib/db');
    await db.updateClipTime(clip.id, clip.start_time + localT, clip.end_time, playheadSeconds);
    onTimelineChange();
  };

  const handleDeleteRight = async () => {
    if (selectedClipId === null) return;
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    const localT = playheadSeconds - clip.timeline_start;
    const dur = clip.end_time - clip.start_time;
    if (localT <= 0 || localT >= dur) { alert('Playhead must be inside the selected clip.'); return; }
    onBeforeChange();
    const db = await import('../lib/db');
    await db.updateClipTime(clip.id, clip.start_time, clip.start_time + localT, clip.timeline_start);
    onTimelineChange();
  };

  const handleAddMarker = async () => {
    if (!projectId) return;
    const db = await import('../lib/db');
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
    const db = await import('../lib/db');
    await db.extractAudio(clipId);
    setContextMenu(null);
    onTimelineChange();
  };

  const handleToggleMute = async (clipId: number, currentEnabled: number) => {
    onBeforeChange();
    const db = await import('../lib/db');
    await db.setAudioEnabled(clipId, currentEnabled === 0);
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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); onUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); onRedo(); return; }
      if (e.key === 's' || e.key === 'S') handleSplit();
      if (e.key === 'q' || e.key === 'Q') handleDeleteLeft();
      if (e.key === 'w' || e.key === 'W') handleDeleteRight();
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
      if (e.key === 'm' || e.key === 'M') handleAddMarker();
      if (e.key === '+' || e.key === '=') handleZoom(p => p * 1.25);
      if (e.key === '-') handleZoom(p => p * 0.8);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPlayheadChange(Math.max(0, playheadSeconds - 1 / 30));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onPlayheadChange(Math.min(videoDuration, playheadSeconds + 1 / 30));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClipId, playheadSeconds, clips, onUndo, onRedo, videoDuration, onPlayheadChange]);

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

    const isMuted  = clip.audio_enabled === 0;

    const label = clip.file_path?.split(/[/\\]/).pop() ?? '';
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
  };

  return (
    <div className="timeline-section" onWheel={onWheel}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="timeline-toolbar">
        <div className="timeline-tools-left">
          <button className="tl-btn tl-btn-add" title="Add media"><AddIcon /></button>
          <button className="tl-btn tl-btn-active" title="Selection tool"><SelectIcon /></button>
          <div className="tl-divider" />
          <button className="tl-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><UndoIcon /></button>
          <button className="tl-btn" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><RedoIcon /></button>
          <div className="tl-divider" />
          <button className="tl-btn" title="Split at playhead (S)" disabled={!canSplit} onClick={handleSplit}><SplitIcon /></button>
          <button className="tl-btn" title="Delete left part (Q)" disabled={selectedClipId === null} onClick={handleDeleteLeft}><DeleteLeftIcon /></button>
          <button className="tl-btn" title="Delete right part (W)" disabled={selectedClipId === null} onClick={handleDeleteRight}><DeleteRightIcon /></button>
          <button className="tl-btn" title="Delete selected (Delete)" disabled={selectedClipId === null} onClick={() => handleDelete()}><TrashIcon /></button>
          <div className="tl-divider" />
          <button className="tl-btn tl-btn-marker" title="Add marker (M)" onClick={handleAddMarker}><MarkerIcon /></button>
        </div>

        <div className="timeline-tools-right">
          <button className={`tl-btn ${magnetOn ? 'tl-btn-active' : ''}`} title="Toggle snapping" onClick={() => setMagnetOn(m => !m)}>
            <MagnetIcon active={magnetOn} />
          </button>
          <div className="tl-divider" />
          <button className="tl-btn" title="Zoom to fit" onClick={handleZoomFit}><ZoomFitIcon /></button>
          <button className="tl-btn" title="Zoom out (-)" onClick={() => handleZoom(p => p * 0.75)}><ZoomOutIcon /></button>
          <input type="range" min="0" max="1" step="0.001" value={zoomToSlider(pps)}
            onChange={e => handleZoom(sliderToZoom(Number(e.target.value)))} className="tl-zoom-slider" title="Zoom" />
          <button className="tl-btn" title="Zoom in (+)" onClick={() => handleZoom(p => p * 1.33)}><ZoomInIcon /></button>
          <div className="tl-divider" />
          <span className="tl-timecode" ref={timecodeDomRef as React.RefObject<HTMLSpanElement>}>{fmt(playheadSeconds)} / {fmt(videoDuration)}</span>
        </div>
      </div>

      {/* ── Timeline body ────────────────────────────────── */}
      <div className="timeline-body">

        {/* Track labels with ... menu */}
        <div className="timeline-track-labels" onClick={() => setOpenTrackMenu(null)}>
          <div className="tl-ruler-spacer" style={{ height: RULER_HEIGHT }} />
          {(['text','caption','video','audio'] as const).map(track => {
            const visible = track === 'text' ? textClips.length > 0 : true;
            if (!visible) return null;
            const h = track === 'video' ? TRACK_VIDEO_H : track === 'audio' ? TRACK_AUDIO_H : TRACK_TEXT_H;
            const ts = trackStates[track];
            return (
              <div key={track} className={`track-label ${track}-track`} style={{ height: h, position: 'relative' }}>
                <span className={ts.hidden ? 'tl-track-hidden' : ''}>
                  {ts.locked ? '🔒' : ''}{ts.muted ? '🔇' : ''} {track.toUpperCase()}
                </span>
                <button
                  className="tl-track-opts-btn"
                  title="Track options"
                  onClick={e => { e.stopPropagation(); setOpenTrackMenu(openTrackMenu === track ? null : track); }}
                >⋯</button>
                {openTrackMenu === track && (
                  <div className="tl-track-menu">
                    <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], locked: !s[track].locked}})); setOpenTrackMenu(null); }}>
                      {ts.locked ? '🔓 Unlock track' : '🔒 Lock track'}
                    </button>
                    <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], hidden: !s[track].hidden}})); setOpenTrackMenu(null); }}>
                      {ts.hidden ? '👁 Show track' : '🙈 Hide track'}
                    </button>
                    <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], muted: !s[track].muted}})); setOpenTrackMenu(null); }}>
                      {ts.muted ? '🔊 Unmute track' : '🔇 Mute track'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
              {ticks.filter(t => t.major).map(({ t, label }) => (
                <div key={`maj-${t}`} className="ruler-tick" style={{ left: t * pps }}>
                  <span className="ruler-label">{label}</span>
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

            {/* ── Playhead (fully ref-driven, never overwritten by React render) */}
            {playheadDomRef && (
              <TimelinePlayhead
                initialLeftPx={playheadX}
                onSeek={onPlayheadChange}
                pps={pps}
                totalDur={totalDur}
                tracksScrollRef={tracksRef}
                playheadRef={playheadDomRef}
                onSnapGuide={setSnapGuideX}
                snapTargets={snapTargets}
                snapThresholdPx={SNAP_THRESHOLD_PX}
                magnetOn={magnetOn}
              />
            )}

            {/* ── Snap guide ────────────────────────────── */}
            {snapGuideX !== null && (
              <div className="snap-guide" style={{ left: snapGuideX }} />
            )}

            {/* ── Marker lines + flags ───────────────────── */}
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
              {/* Audio shadow from video clips (only if audio is enabled) */}
              {videoClips.map(clip => {
                if (clip.audio_enabled === 0) return null;
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

      {/* ── Clip context menu ──────────────────────────── */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {(() => {
            const clip = clips.find(c => c.id === contextMenu.clipId);
            if (!clip) return null;
            const isVideo = clip.track_type === 'video';
            const isMuted = clip.audio_enabled === 0;

            return (
              <>
                {isVideo && (
                  <button onClick={() => handleExtractAudio(clip.id)}>🎵 Extract Audio</button>
                )}
                {isVideo && (
                  <button onClick={() => handleToggleMute(clip.id, clip.audio_enabled ?? 1)}>
                    {isMuted ? '🔊 Unmute Audio' : '🔇 Mute Audio'}
                  </button>
                )}
                <button onClick={async () => {
                  onBeforeChange();
                  const db = await import('../lib/db');
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

      {/* ── Marker context menu ────────────────────────── */}
      {markerCtxMenu && (
        <div className="context-menu" style={{ top: markerCtxMenu.y, left: markerCtxMenu.x }}
          onClick={() => setMarkerCtxMenu(null)}>
          <button onClick={async () => {
            const db = await import('../lib/db');
            await db.deleteMarker(markerCtxMenu.markerId);
            setMarkerCtxMenu(null);
            onMarkersChange();
          }}>🗑️ Delete Marker</button>
        </div>
      )}
    </div>
  );
}
