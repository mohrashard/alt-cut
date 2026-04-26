import {
  useState, useRef, useCallback, useEffect, useMemo
} from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { TimelineClip } from '../../lib/db';
import { TimelinePlayhead } from '../TimelinePlayhead';
import {
  DEFAULT_PPS, MIN_PPS, MAX_PPS,
  SNAP_THRESHOLD_PX,
  type TrackState, type TimelineProps,
} from './constants';
import { fmt, getRulerTicks } from './utils';
import type { SnapPoint } from './snapping';
import { TimelineRuler } from './timeline-ruler';
import { SnapIndicator } from './snap-indicator';
import { TimelineToolbar } from './timeline-toolbar';
import { TimelineTrackLabels, TimelineTrackContent } from './timeline-track';
import { ClipContextMenu, MarkerContextMenu, clipboardClips, setClipboard } from './timeline-context-menu';

export function Timeline({
  clips, videoDuration, selectedClipIds, playheadSeconds,
  onClipSelected, onPlayheadChange, onTimelineChange, onBeforeChange,
  canUndo, canRedo, onUndo, onRedo,
  markers, projectId, onMarkersChange,
  playheadDomRef, onPpsChange, timecodeDomRef,
  onRevealAsset, engineTimeRef,
}: TimelineProps) {
  const { setNodeRef: setVideoDropRef, isOver: isVideoOver } = useDroppable({ id: 'timeline-droppable' });
  const { setNodeRef: setAudioDropRef, isOver: isAudioOver } = useDroppable({ id: 'timeline-audio-droppable' });

  const [pps, setPps] = useState(DEFAULT_PPS);
  const [magnetOn, setMagnetOn] = useState(true);

  // ── Ripple editing state ───────────────────────────────────────
  const [rippleOn, setRippleOn] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const [snapPoint, setSnapPoint] = useState<SnapPoint | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: number } | null>(null);
  const [markerCtxMenu, setMarkerCtxMenu] = useState<{ x: number; y: number; markerId: number } | null>(null);
  const [openTrackMenu, setOpenTrackMenu] = useState<string | null>(null);
  const [trackStates, setTrackStates] = useState<Record<string, TrackState>>({
    video: { locked: false, hidden: false, muted: false },
    audio: { locked: false, hidden: false, muted: false },
    text: { locked: false, hidden: false, muted: false },
    caption: { locked: false, hidden: false, muted: false },
  });

  const [trimState, setTrimState] = useState<{
    clipId: number; edge: 'left' | 'right'; startMouseX: number;
    origStart: number; origEnd: number; origTimelineStart: number;
    currentStart: number; currentEnd: number; currentTimelineStart: number;
  } | null>(null);

  const [dragClip, setDragClip] = useState<{
    clipIds: number[];
    startMouseX: number;
    offsets: Record<number, { origTimelineStart: number; currentTimelineStart: number }>;
  } | null>(null);

  const [dragVolume, setDragVolume] = useState<{ clipIds: number[]; volume: number } | null>(null);

  // ── Clipboard ─────────────────────────────────────────────────
  const [hasPasteContent, setHasPasteContent] = useState(clipboardClips.length > 0);

  const tracksRef = useRef<HTMLDivElement>(null);
  const mouseXRef = useRef(0);
  const isAnyDragging = trimState !== null || dragClip !== null;

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { mouseXRef.current = e.clientX; };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  useEffect(() => {
    const clearSnap = () => setSnapPoint(null);
    const clearDrags = () => {
      setSnapPoint(null);
      setDragClip(null);
      setTrimState(null);
    };
    document.addEventListener('mouseup', clearSnap);
    window.addEventListener('blur', clearDrags);
    document.addEventListener('mouseleave', clearDrags);
    return () => {
      document.removeEventListener('mouseup', clearSnap);
      window.removeEventListener('blur', clearDrags);
      document.removeEventListener('mouseleave', clearDrags);
    };
  }, []);

  useEffect(() => {
    if (!isAnyDragging) return;
    let raf: number;
    const loop = () => {
      if (tracksRef.current) {
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
    return () => cancelAnimationFrame(raf);
  }, [isAnyDragging]);

  const totalDur = Math.max(videoDuration, 10);
  const totalWidth = totalDur * pps + 400;

  const handleZoom = useCallback((newPps: number | ((prev: number) => number)) => {
    setPps(oldPps => {
      const target = typeof newPps === 'function' ? newPps(oldPps) : newPps;
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
  const textClips = useMemo(() => clips.filter(c => c.track_type === 'text'), [clips]);

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
        setSnapPoint({ timeSec: t, x: t * pps });
        return t;
      }
    }
    setSnapPoint(null);
    return rawSec;
  }, [magnetOn, snapTargets, pps]);

  // ── Ripple helper: shift all clips that start at or after `afterSec`
  //    by `deltaSec` (positive = push right, negative = pull left) ──────
  const applyRipple = useCallback(async (
    db: typeof import('../../lib/db'),
    afterSec: number,
    deltaSec: number,
    excludeIds: number[] = [],
  ) => {
    const toShift = clips.filter(
      c => c.timeline_start >= afterSec && !excludeIds.includes(c.id)
    );
    for (const c of toShift) {
      const newStart = Math.max(0, c.timeline_start + deltaSec);
      await db.updateClipTime(c.id, c.start_time, c.end_time, newStart);
    }
  }, [clips]);

  const onRulerMouseDown = (e: React.MouseEvent) => {
    if (!tracksRef.current) return;
    e.stopPropagation();
    const container = tracksRef.current;
    const computeSec = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const rawPx = clientX - rect.left + container.scrollLeft;
      return Math.max(0, Math.min(rawPx / pps, totalDur));
    };
    onPlayheadChange(computeSec(e.clientX));
    const onMouseMove = (ev: MouseEvent) => onPlayheadChange(computeSec(ev.clientX));
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
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
  };

  const onTrimDrag = useCallback((e: MouseEvent) => {
    if (!trimState) return;
    const deltaPx = e.clientX - trimState.startMouseX;
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
    if (!trimState) return;
    const db = await import('../../lib/db');

    // Ripple: if right-edge trim, shift everything after old clip end
    if (rippleOn && trimState.edge === 'right') {
      const oldEnd = trimState.origTimelineStart + (trimState.origEnd - trimState.origStart);
      const newEnd = trimState.currentTimelineStart + (trimState.currentEnd - trimState.currentStart);
      const delta = newEnd - oldEnd;
      await applyRipple(db, oldEnd, delta, [trimState.clipId]);
    }

    await db.updateClipTime(trimState.clipId, trimState.currentStart, trimState.currentEnd, trimState.currentTimelineStart);
    setTrimState(null);
    setSnapPoint(null);
    onTimelineChange();
  }, [trimState, rippleOn, applyRipple, onTimelineChange]);

  const onClipDragStart = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    if (e.shiftKey) return;
    const idsToDrag = selectedClipIds.includes(clip.id) ? selectedClipIds : [clip.id];
    if (!selectedClipIds.includes(clip.id)) onClipSelected([clip.id]);
    const offsets: Record<number, { origTimelineStart: number; currentTimelineStart: number }> = {};
    for (const id of idsToDrag) {
      const c = clips.find(x => x.id === id);
      if (c) offsets[id] = { origTimelineStart: c.timeline_start, currentTimelineStart: c.timeline_start };
    }
    setDragClip({ clipIds: idsToDrag, startMouseX: e.clientX, offsets });
  };

  const onClipDragging = useCallback(async (e: MouseEvent) => {
    if (!dragClip) return;
    const deltaPx = e.clientX - dragClip.startMouseX;
    let deltaSec = deltaPx / pps;
    let minOrig = Infinity;
    for (const id of dragClip.clipIds) {
      const orig = dragClip.offsets[id].origTimelineStart;
      if (orig < minOrig) minOrig = orig;
    }
    if (minOrig + deltaSec < 0) deltaSec = -minOrig;
    const firstId = dragClip.clipIds[0];
    const rawFirst = dragClip.offsets[firstId].origTimelineStart + deltaSec;
    const snappedFirst = snapSeconds(rawFirst);
    let finalDelta = snappedFirst - dragClip.offsets[firstId].origTimelineStart;
    if (minOrig + finalDelta < 0) finalDelta = -minOrig;
    setDragClip(prev => {
      if (!prev) return null;
      const newOffsets = { ...prev.offsets };
      for (const id of prev.clipIds) {
        newOffsets[id] = { ...newOffsets[id], currentTimelineStart: newOffsets[id].origTimelineStart + finalDelta };
      }
      return { ...prev, offsets: newOffsets };
    });
  }, [dragClip, pps, snapSeconds]);

  const onClipDragEnd = useCallback(async (_e: MouseEvent) => {
    if (!dragClip) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    for (const id of dragClip.clipIds) {
      const snapped = dragClip.offsets[id].currentTimelineStart;
      const clip = clips.find(c => c.id === id);
      if (clip) await db.updateClipTime(clip.id, clip.start_time, clip.end_time, snapped);
    }
    setDragClip(null);
    setSnapPoint(null);
    onTimelineChange();
  }, [dragClip, clips, onTimelineChange, onBeforeChange]);

  useEffect(() => {
    if (trimState) {
      document.addEventListener('mousemove', onTrimDrag);
      document.addEventListener('mouseup', onTrimRelease);
      return () => {
        document.removeEventListener('mousemove', onTrimDrag);
        document.removeEventListener('mouseup', onTrimRelease);
      };
    }
  }, [trimState, onTrimDrag, onTrimRelease]);

  useEffect(() => {
    if (dragClip) {
      document.addEventListener('mousemove', onClipDragging);
      document.addEventListener('mouseup', onClipDragEnd);
      return () => {
        document.removeEventListener('mousemove', onClipDragging);
        document.removeEventListener('mouseup', onClipDragEnd);
      };
    }
  }, [dragClip, onClipDragging, onClipDragEnd]);

  // ── Split ─────────────────────────────────────────────────────
  const handleSplit = async () => {
    if (selectedClipIds.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    for (const id of selectedClipIds) {
      const clip = clips.find(c => c.id === id);
      if (!clip) continue;
      const localT = playheadSeconds - clip.timeline_start;
      if (localT > 0 && localT < (clip.end_time - clip.start_time)) {
        await db.splitClip(id, playheadSeconds);
      }
    }
    onClipSelected([]);
    onTimelineChange();
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (overrideId?: number) => {
    const idsToDelete = overrideId !== undefined ? [overrideId] : selectedClipIds;
    if (idsToDelete.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');

    // Ripple: collect the end times before deletion so we can shift successors
    const deletedEnds: { end: number; dur: number }[] = [];
    if (rippleOn) {
      for (const id of idsToDelete) {
        const c = clips.find(x => x.id === id);
        if (c) deletedEnds.push({
          end: c.timeline_start + (c.end_time - c.start_time),
          dur: c.end_time - c.start_time,
        });
      }
    }

    for (const id of idsToDelete) {
      await db.deleteTimelineClip(id);
    }

    // Apply ripple shifts (largest end first to avoid overlap)
    if (rippleOn) {
      deletedEnds.sort((a, b) => b.end - a.end);
      for (const { end, dur } of deletedEnds) {
        await applyRipple(db, end, -dur, idsToDelete);
      }
    }

    onClipSelected([]);
    setContextMenu(null);
    onTimelineChange();
  };

  // ── Delete Left ───────────────────────────────────────────────
  const handleDeleteLeft = async () => {
    if (selectedClipIds.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    for (const id of selectedClipIds) {
      const clip = clips.find(c => c.id === id);
      if (!clip) continue;
      const localT = playheadSeconds - clip.timeline_start;
      const dur = clip.end_time - clip.start_time;
      if (localT > 0 && localT < dur) {
        // Ripple: the clip shrinks from the left — its timeline_start moves right,
        // so nothing after it needs shifting (its end stays the same).
        await db.updateClipTime(clip.id, clip.start_time + localT, clip.end_time, playheadSeconds);
      }
    }
    onTimelineChange();
  };

  // ── Delete Right ──────────────────────────────────────────────
  const handleDeleteRight = async () => {
    if (selectedClipIds.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    for (const id of selectedClipIds) {
      const clip = clips.find(c => c.id === id);
      if (!clip) continue;
      const localT = playheadSeconds - clip.timeline_start;
      const dur = clip.end_time - clip.start_time;
      if (localT > 0 && localT < dur) {
        const trimmedDur = localT;
        const removedDur = dur - trimmedDur;

        await db.updateClipTime(clip.id, clip.start_time, clip.start_time + localT, clip.timeline_start);

        // Ripple: shift all clips that start after this clip's old end
        if (rippleOn) {
          const oldEnd = clip.timeline_start + dur;
          await applyRipple(db, oldEnd, -removedDur, [clip.id]);
        }
      }
    }
    onTimelineChange();
  };

  // ── Add Marker ────────────────────────────────────────────────
  const handleAddMarker = async () => {
    if (!projectId) {
      console.warn('handleAddMarker: no projectId');
      return;
    }

    // Grab the time directly from the source of truth (the Ref), not the React State.
    const realTimePlayhead = engineTimeRef?.current ?? playheadSeconds; 

    if (
      typeof realTimePlayhead !== 'number' ||
      isNaN(realTimePlayhead) ||
      realTimePlayhead < 0
    ) {
      console.warn('handleAddMarker: invalid playhead', realTimePlayhead);
      return;
    }

    try {
      const db = await import('../../lib/db');
      
      // Optimistic UI Update (CapCut style): 
      // If you want it to feel instantaneous, trigger a local state update for the UI right here
      // before waiting for the database to finish saving.
      
      // Save to database
      await db.addMarker(projectId, realTimePlayhead);
      
      // Refresh your UI state
      onMarkersChange();
    } catch (err) {
      console.error('handleAddMarker: failed to add marker', err);
    }
  };

  // ── Zoom Fit ──────────────────────────────────────────────────
  const handleZoomFit = () => {
    if (!tracksRef.current || videoDuration <= 0) return;
    const w = tracksRef.current.clientWidth - 20;
    handleZoom(w / videoDuration);
  };

  // ── Duplicate ─────────────────────────────────────────────────
  // Places the duplicate immediately after the original clip(s).
  const handleDuplicate = async () => {
    if (selectedClipIds.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');

    for (const id of selectedClipIds) {
      const clip = clips.find(c => c.id === id);
      if (!clip) continue;
      const dur = clip.end_time - clip.start_time;
      const newTimelineStart = clip.timeline_start + dur;

      // If ripple is on, push all clips that start at or after the insertion point
      if (rippleOn) {
        await applyRipple(db, newTimelineStart, dur, [clip.id]);
      }

      await db.addClipToTimelineSpecific(
        clip.project_id,
        clip.asset_id,
        dur,
        clip.track_type || 'video',
        clip.track_lane ?? 0,
        newTimelineStart,
      );
    }

    setContextMenu(null);
    onTimelineChange();
  };

  // ── Toggle Audio (Link / Unlink) ──────────────────────────────
  // "Unlink" extracts audio to its own audio track.
  // "Link" removes the extracted audio clip and re-enables the video's embedded audio.
  const handleToggleAudio = async () => {
    if (selectedClipIds.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');

    for (const id of selectedClipIds) {
      const clip = clips.find(c => c.id === id);
      if (!clip || (clip.track_type && clip.track_type !== 'video')) continue;

      if (clip.audio_separated) {
        // ── Re-link: delete the paired audio clip and re-enable embedded audio ──
        if (clip.paired_audio_clip_id) {
          await db.deleteTimelineClip(clip.paired_audio_clip_id);
        }
        await db.setAudioSeparated(clip.id, false, null);
        await db.setAudioEnabled(clip.id, true);
      } else {
        // ── Unlink: create an independent audio clip on the audio track ──
        await db.setAudioEnabled(clip.id, false);   // mute embedded audio
        const audioClip = await db.addClipToTimelineSpecific(
          clip.project_id,
          clip.asset_id,
          clip.end_time - clip.start_time,
          'audio',
          0,
          clip.timeline_start,
        );
        // Store back-reference so re-linking knows which clip to remove
        await db.setAudioSeparated(clip.id, true, audioClip.id);
      }
    }

    onTimelineChange();
  };

  // ── Derived: can the selected clips use Link/Unlink? ──────────
  const selectedVideoClips = useMemo(
    () => clips.filter(c => selectedClipIds.includes(c.id) && (!c.track_type || c.track_type === 'video')),
    [clips, selectedClipIds],
  );
  const canToggleAudio = selectedVideoClips.length > 0;
  // Show "Unlink" icon when at least one selected video clip already has separated audio
  const isAudioSeparated = selectedVideoClips.some(c => !!c.audio_separated);

  // ── Context menu operations ───────────────────────────────────
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

  const handleToggleHidden = async (clipId: number, currentHidden: number) => {
    onBeforeChange();
    const db = await import('../../lib/db');
    await db.setClipHidden(clipId, currentHidden !== 1);
    setContextMenu(null);
    onTimelineChange();
  };

  const onClipOptionsClick = (e: React.MouseEvent, clipId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedClipIds.includes(clipId)) onClipSelected([clipId]);
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  const onVolumeChange = useCallback((clipId: number, volume: number) => {
    const ids = selectedClipIds.includes(clipId) ? selectedClipIds : [clipId];
    setDragVolume({ clipIds: ids, volume });
  }, [selectedClipIds]);

  const onVolumeDragEnd = useCallback(async (clipId: number, volume: number) => {
    onBeforeChange();
    const ids = selectedClipIds.includes(clipId) ? selectedClipIds : [clipId];
    const db = await import('../../lib/db');
    for (const id of ids) {
      await db.setAudioVolume(id, volume);
    }
    setDragVolume(null);
    onTimelineChange();
  }, [selectedClipIds, onBeforeChange, onTimelineChange]);

  // ── Context menu auto-close ───────────────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', close, { once: true });
      document.addEventListener('contextmenu', close, { once: true });
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!markerCtxMenu) return;
    const close = () => setMarkerCtxMenu(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', close, { once: true });
      document.addEventListener('contextmenu', close, { once: true });
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [markerCtxMenu]);

  // ── Copy / Paste ──────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const toCopy = clips.filter(c => selectedClipIds.includes(c.id));
    if (toCopy.length === 0) return;
    setClipboard(toCopy);
    setHasPasteContent(true);
    setContextMenu(null);
  }, [clips, selectedClipIds]);

  const handlePaste = useCallback(async () => {
    if (clipboardClips.length === 0) return;
    onBeforeChange();
    const db = await import('../../lib/db');
    const minStart = Math.min(...clipboardClips.map(c => c.timeline_start));
    const offset = playheadSeconds - minStart;
    for (const c of clipboardClips) {
      await db.addClipToTimelineSpecific(
        c.project_id, c.asset_id,
        c.end_time - c.start_time,
        c.track_type || 'video',
        c.track_lane ?? 0,
        c.timeline_start + offset,
      );
    }
    setContextMenu(null);
    onTimelineChange();
  }, [playheadSeconds, onBeforeChange, onTimelineChange]);

  // ── Replace Media ─────────────────────────────────────────────
  const handleReplaceMedia = useCallback(async (clipId: number) => {
    setContextMenu(null);
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
      const file = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg'] }],
      });
      const filePath = typeof file === 'string' ? file : (file as any)?.path ?? (Array.isArray(file) ? file[0] : null);
      if (!filePath) return;
      let duration = 0;
      try { duration = Number(await invoke<number>('get_video_duration', { videoPath: filePath })); } catch { }
      if (isNaN(duration) || duration <= 0) {
        try {
          duration = await new Promise<number>(res => {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => res(v.duration);
            v.onerror = () => res(0);
            v.src = convertFileSrc(filePath);
          });
        } catch { }
      }
      if (isNaN(duration) || duration <= 0) duration = clip.end_time - clip.start_time;
      onBeforeChange();
      const db = await import('../../lib/db');
      const asset = await db.addAsset(clip.project_id, filePath, 'video', duration);
      await db.replaceClipAsset(clipId, asset.id);
      onTimelineChange();
    } catch (e) {
      console.error('Replace media failed:', e);
    }
  }, [clips, onBeforeChange, onTimelineChange]);

  // ── Reveal in Media ───────────────────────────────────────────
  const handleRevealInMedia = useCallback((assetId: number) => {
    setContextMenu(null);
    onRevealAsset?.(assetId);
  }, [onRevealAsset]);

  // ── Keyboard shortcuts (stable ref pattern) ───────────────────
  const actionsRef = useRef({
    onUndo, onRedo, handleCopy, handlePaste, handleSplit,
    handleDeleteLeft, handleDeleteRight, handleDelete, handleAddMarker,
    handleZoom, onPlayheadChange, handleDuplicate,
  });
  const stateRef = useRef({ playheadSeconds, videoDuration });

  useEffect(() => {
    actionsRef.current = {
      onUndo, onRedo, handleCopy, handlePaste, handleSplit,
      handleDeleteLeft, handleDeleteRight, handleDelete, handleAddMarker,
      handleZoom, onPlayheadChange, handleDuplicate,
    };
    stateRef.current = { playheadSeconds, videoDuration };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const {
        onUndo, onRedo, handleCopy, handlePaste, handleSplit,
        handleDeleteLeft, handleDeleteRight, handleDelete, handleAddMarker,
        handleZoom, onPlayheadChange, handleDuplicate,
      } = actionsRef.current;
      const { playheadSeconds, videoDuration } = stateRef.current;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); onUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); onRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); handleCopy(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); handlePaste(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); handleDuplicate(); return; }
      if (e.key === 's' || e.key === 'S') handleSplit();
      if (e.key === 'q' || e.key === 'Q') handleDeleteLeft();
      if (e.key === 'w' || e.key === 'W') handleDeleteRight();
      if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
      if (e.key === 'm' || e.key === 'M') handleAddMarker();
      if (e.key === '+' || e.key === '=') handleZoom((p: number) => p * 1.25);
      if (e.key === '-') handleZoom((p: number) => p * 0.8);
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPlayheadChange(Math.max(0, playheadSeconds - 1 / 30)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onPlayheadChange(Math.min(videoDuration, playheadSeconds + 1 / 30)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { ticks } = getRulerTicks(pps, totalDur);
  const playheadX = playheadSeconds * pps;
  const selectedClips = clips.filter(c => selectedClipIds.includes(c.id));
  const canDeleteL = selectedClips.some(c =>
    playheadSeconds > c.timeline_start &&
    playheadSeconds < c.timeline_start + (c.end_time - c.start_time)
  );
  const canSplit = canDeleteL;

  const handleClipClick = (e: React.MouseEvent, clipId: number) => {
    e.stopPropagation();
    if (e.shiftKey) {
      if (selectedClipIds.includes(clipId)) {
        onClipSelected(selectedClipIds.filter(id => id !== clipId));
      } else {
        onClipSelected([...selectedClipIds, clipId]);
      }
    } else {
      onClipSelected([clipId]);
    }
  };

  const handleEmptyTrackClick = () => { onClipSelected([]); setContextMenu(null); };

  const elementProps = {
    pps,
    onClipSelected: handleClipClick,
    onClipDragStart,
    onClipOptionsClick,
    onTrimMouseDown,
    trimState,
    onVolumeChange,
    onVolumeDragEnd,
  };

  return (
    <div className="timeline-section" ref={timelineRef} onWheel={onWheel}>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <TimelineToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        canSplit={canSplit}
        selectedClipIds={selectedClipIds}
        magnetOn={magnetOn}
        rippleEditingOn={rippleOn}
        canDuplicate={selectedClipIds.length > 0}
        canToggleAudio={canToggleAudio}
        isAudioSeparated={isAudioSeparated}
        pps={pps}
        playheadSeconds={playheadSeconds}
        videoDuration={videoDuration}
        timecodeDomRef={timecodeDomRef}
        onUndo={onUndo}
        onRedo={onRedo}
        onSplit={handleSplit}
        onDeleteLeft={handleDeleteLeft}
        onDeleteRight={handleDeleteRight}
        onDelete={handleDelete}
        onAddMarker={handleAddMarker}
        onToggleMagnet={() => setMagnetOn(m => !m)}
        onToggleRippleEditing={() => setRippleOn(r => !r)}
        onDuplicate={handleDuplicate}
        onToggleAudio={handleToggleAudio}
        onZoomFit={handleZoomFit}
        onZoomOut={() => handleZoom(p => p * 0.75)}
        onZoomIn={() => handleZoom(p => p * 1.33)}
        onZoomSlider={(v) => handleZoom(v)}
      />

      {/* ── Timeline body ────────────────────────────────── */}
      <div className="timeline-body">

        <TimelineTrackLabels
          textClips={textClips} trackStates={trackStates}
          openTrackMenu={openTrackMenu}
          setOpenTrackMenu={setOpenTrackMenu}
          setTrackStates={setTrackStates}
        />

        <div className="timeline-tracks" ref={tracksRef}>
          <div style={{ minWidth: '100%', width: totalWidth, position: 'relative', minHeight: '100%' }}>

            <TimelineRuler
              ticks={ticks}
              pps={pps}
              totalWidth={totalWidth}
              onRulerMouseDown={onRulerMouseDown}
              tracksRef={tracksRef}
              playheadSeconds={playheadSeconds}
              totalDur={totalDur}
            />

            {playheadDomRef && (
              <TimelinePlayhead
                initialLeftPx={playheadX} onSeek={onPlayheadChange}
                pps={pps} totalDur={totalDur} tracksScrollRef={tracksRef}
                playheadRef={playheadDomRef} onSnapGuide={(px: number | null) =>
                  setSnapPoint(px !== null ? { timeSec: px / pps, x: px } : null)
                }
                snapTargets={snapTargets} snapThresholdPx={SNAP_THRESHOLD_PX}
                magnetOn={magnetOn} currentTimeSec={playheadSeconds}
              />
            )}

            <SnapIndicator
              snapPoint={snapPoint}
              zoomLevel={pps}
              isVisible={snapPoint !== null}
              timelineRef={timelineRef}
              tracksScrollRef={tracksRef}
            />

            {markers.map(marker => (
              <div key={`ml-${marker.id}`} className="marker-line"
                style={{ left: marker.time_seconds * pps, borderColor: marker.color }}>
                <div className="marker-flag" style={{ background: marker.color }}
                  title={marker.label || fmt(marker.time_seconds)}
                  onClick={() => onPlayheadChange(marker.time_seconds)}
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation();
                    setMarkerCtxMenu({ x: e.clientX, y: e.clientY, markerId: marker.id });
                  }} />
              </div>
            ))}

            {textClips.length > 0 && (
              <TimelineTrackContent
                trackKind="text"
                clips={textClips}
                dragClip={dragClip}
                dragVolume={dragVolume}
                selectedClipIds={selectedClipIds}
                pps={pps}
                onEmptyTrackClick={handleEmptyTrackClick}
                elementProps={elementProps}
              />
            )}
            <TimelineTrackContent
              trackKind="caption"
              clips={[]}
              dragClip={dragClip}
              dragVolume={dragVolume}
              selectedClipIds={selectedClipIds}
              pps={pps}
              onEmptyTrackClick={handleEmptyTrackClick}
              elementProps={elementProps}
            />
            <TimelineTrackContent
              trackKind="video"
              clips={videoClips}
              dragClip={dragClip}
              dragVolume={dragVolume}
              selectedClipIds={selectedClipIds}
              pps={pps}
              onEmptyTrackClick={handleEmptyTrackClick}
              droppableRef={setVideoDropRef}
              isOver={isVideoOver}
              emptyHint={<><span>📦</span><span>Drag video here to start</span></>}
              elementProps={elementProps}
            />
            <TimelineTrackContent
              trackKind="audio"
              clips={audioClips}
              shadowClips={videoClips}
              dragClip={dragClip}
              dragVolume={dragVolume}
              selectedClipIds={selectedClipIds}
              pps={pps}
              onEmptyTrackClick={handleEmptyTrackClick}
              droppableRef={setAudioDropRef}
              isOver={isAudioOver}
              emptyHint={<><span>🎵</span><span>Drag audio here</span></>}
              elementProps={elementProps}
            />

          </div>
        </div>
      </div>

      <ClipContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        clips={clips}
        selectedClipIds={selectedClipIds}
        onClipSelected={onClipSelected}
        onExtractAudio={handleExtractAudio}
        onToggleMute={handleToggleMute}
        onToggleHidden={handleToggleHidden}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSplit={handleSplit}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onRevealInMedia={handleRevealInMedia}
        onReplaceMedia={handleReplaceMedia}
        hasPasteContent={hasPasteContent}
      />

      <MarkerContextMenu
        markerCtxMenu={markerCtxMenu}
        onDeleteMarker={async (markerId) => {
          const db = await import('../../lib/db');
          await db.deleteMarker(markerId);
          setMarkerCtxMenu(null);
          onMarkersChange();
        }}
        onClose={() => setMarkerCtxMenu(null)}
      />
    </div>
  );
}