import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core';
import type { TimelineClip, Marker, ClipEffects, Transition } from './lib/db';

import { TopNav } from "./components/TopNav";
import { IconRail } from "./components/IconRail";
import { MediaSidebar } from "./components/MediaSidebar";
import { PreviewWindow } from "./components/PreviewWindow";
import { PropertiesPanel, AppFeatures } from "./components/PropertiesPanel";
import { Timeline } from "./components/Timeline";
import { TransitionsSidebar } from "./components/TransitionsSidebar";
import { EffectsSidebar } from "./components/EffectsSidebar";
import "./App.css";

// ═══════════════════════════════════════════════════════════════
// 1. REDUCER-BASED HISTORY (Zero stale closures)
// ═══════════════════════════════════════════════════════════════

type HistoryState = {
  past: TimelineClip[][];
  present: TimelineClip[];
  future: TimelineClip[][];
};

type HistoryAction =
  | { type: 'INIT'; clips: TimelineClip[] }
  | { type: 'SNAPSHOT'; clips: TimelineClip[] }
  | { type: 'REPLACE'; clips: TimelineClip[] }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'INIT':
      return { past: [], present: JSON.parse(JSON.stringify(action.clips)), future: [] };
    case 'SNAPSHOT': {
      const snap = JSON.parse(JSON.stringify(action.clips));
      const last = state.past[state.past.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) return state;
      return { ...state, past: [...state.past, snap], future: [] };
    }
    case 'REPLACE':
      // BUG FIX: Use shallow clone instead of expensive JSON deep-clone for 10x faster refreshes
      return { ...state, present: [...action.clips], future: [] };
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }
  }
}

function useTimelineHistory() {
  const [state, dispatch] = useReducer(historyReducer, { past: [], present: [], future: [] });

  const init = useCallback((clips: TimelineClip[]) => {
    dispatch({ type: 'INIT', clips });
  }, []);

  return useMemo(() => ({
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    init,
    snapshot: (clips: TimelineClip[]) => dispatch({ type: 'SNAPSHOT', clips }),
    replace: (clips: TimelineClip[]) => dispatch({ type: 'REPLACE', clips }),
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
  }), [state.past.length, state.future.length, state.present, init]);
}

// ═══════════════════════════════════════════════════════════════
// 2. PROJECT HOOK (Minimal — just loads the project row)
// ═══════════════════════════════════════════════════════════════

function useProject() {
  const [project, setProject] = useState<any>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    import('./lib/db').then(async db => {
      await db.runMigrations();
      const proj = await db.ensureDefaultProject();
      if (!ctrl.signal.aborted) setProject(proj);
    });
    return () => ctrl.abort();
  }, []);
  return { project };
}

// ═══════════════════════════════════════════════════════════════
// 3. MAIN APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [isRendering, setIsRendering] = useState(false);
  const [features, setFeatures] = useState<AppFeatures | null>(null);
  const [activeToolTab, setActiveToolTab] = useState('media');
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [pps, setPps] = useState(80);
  const [selectedClipIds, setSelectedClipIds] = useState<number[]>([]);
  const [highlightAssetId, setHighlightAssetId] = useState<number | null>(null);
  const [styleOverride, setStyleOverride] = useState<{ clipId: number | string; style: any } | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);

  const playheadDomRef = useRef<HTMLDivElement>(null);
  const timecodeDomRef = useRef<HTMLSpanElement>(null);
  const engineTimeRef = useRef(0);
  const clipsRef = useRef<TimelineClip[]>([]);

  const { project } = useProject();
  const history = useTimelineHistory();

  // Local state derived from history (single source of truth)
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);

  // Sync ref so callbacks never stale
  useEffect(() => { clipsRef.current = timelineClips; }, [timelineClips]);

  // Sync history.present -> timelineClips (undo/redo/restore)
  useEffect(() => {
    setTimelineClips(history.present);
  }, [history.present]);

  // Initial load: DB -> history.init -> effect above sets timelineClips
  useEffect(() => {
    if (!project?.id) return;
    const ctrl = new AbortController();
    Promise.all([
      import('./lib/db').then(db => db.getTimelineClips(project.id)),
      import('./lib/db').then(db => db.getMarkers(project.id)),
    ]).then(([clips, m]) => {
      if (ctrl.signal.aborted) return;
      setMarkers(m);
      history.init(clips);
    });
    return () => ctrl.abort();
  }, [project?.id, history.init]);

  // Load transitions when clip IDs change
  const clipIdsKey = useMemo(() => timelineClips.map(c => c.id).join(','), [timelineClips]);
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    import('./lib/db').then(db => db.getAllTransitions(project.id)).then(t => {
      if (!cancelled) setTransitions(t);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [clipIdsKey, project?.id]);

  // ─── Derived Selection ─────────────────────────────────────
  const selectedClips = useMemo(
    () => timelineClips.filter(c => selectedClipIds.includes(c.id)),
    [timelineClips, selectedClipIds]
  );
  const selectedClip = selectedClips.length === 1 ? selectedClips[0] : null;

  const currentEffects = useMemo(() => {
    const defaults = { brightness: 1.0, contrast: 1.0, saturation: 1.0, blur: 0, sharpen: 0 };
    if (!selectedClip?.effects) return defaults;
    try { return { ...defaults, ...JSON.parse(selectedClip.effects) }; }
    catch { return defaults; }
  }, [selectedClip?.effects]);

  // ─── Stable Callbacks (prevent Remotion remounts) ──────────
  const handleTimelineChange = useCallback(async () => {
    if (!project?.id) return;
    const db = await import('./lib/db');
    const clips = await db.getTimelineClips(project.id);
    history.replace(clips);
  }, [project?.id, history]);

  const handleSilentRefresh = useCallback(async () => {
    if (!project?.id) return;
    const db = await import('./lib/db');
    const clips = await db.getTimelineClips(project.id);
    history.replace(clips);
  }, [project?.id, history]);

  const handleLiveClipUpdate = useCallback((clipId: number, patch: Partial<TimelineClip>) => {
    setTimelineClips(prev => prev.map(c => c.id === clipId ? { ...c, ...patch } : c));
  }, []);

  const handleMarkersChange = useCallback(async () => {
    if (!project?.id) return;
    const db = await import('./lib/db');
    setMarkers(await db.getMarkers(project.id));
  }, [project?.id]);

  const onBeforeChange = useCallback(() => {
    history.snapshot(clipsRef.current);
  }, [history]);

  // ─── Mutations (ref-stable, history-aware) ─────────────────
  const mutateTimeline = useCallback(async (mutateFn: () => Promise<void>) => {
    history.snapshot(clipsRef.current);
    try {
      await mutateFn();
      if (project?.id) {
        const db = await import('./lib/db');
        const clips = await db.getTimelineClips(project.id);
        history.replace(clips);
      }
    } catch (err) {
      console.error("Mutation failed:", err);
      // Rollback: Re-sync UI with current DB state
      if (project?.id) {
        const db = await import('./lib/db');
        const clips = await db.getTimelineClips(project.id);
        history.replace(clips);
      }
    }
  }, [history, project?.id]);

  const handleAddClip = useCallback(async (asset: any, trackType: 'video' | 'audio' | 'text') => {
    if (!project?.id) return;
    await mutateTimeline(async () => {
      const db = await import('./lib/db');
      const dur = asset.duration > 0 ? asset.duration : 1.0;
      await db.addClipToTimeline(project.id, asset.id, dur, trackType, 0);
    });
  }, [project?.id, mutateTimeline]);

  const handleApplyTransition = useCallback(async (transitionType: string) => {
    if (!selectedClip || !project?.id) return;
    await mutateTimeline(async () => {
      const db = await import('./lib/db');
      const sameTrack = clipsRef.current
        .filter(c => c.track_type === selectedClip.track_type && c.track_lane === selectedClip.track_lane)
        .sort((a, b) => a.timeline_start - b.timeline_start);

      const idx = sameTrack.findIndex(c => c.id === selectedClip.id);
      if (idx <= 0) {
        console.warn("Transitions require a preceding clip on the same track.");
        return;
      }
      const prev = sameTrack[idx - 1];
      if (transitionType === 'none') {
        await db.deleteTransition(prev.id, selectedClip.id);
      } else {
        await db.upsertTransition({
          project_id: project.id,
          track_id: selectedClip.track_lane,
          clip_a_id: prev.id,
          clip_b_id: selectedClip.id,
          type: transitionType as any,
          duration_frames: 15
        });
      }
    });
  }, [selectedClip, project?.id, mutateTimeline]);

  const handleApplyEffects = useCallback(async (effects: ClipEffects) => {
    if (!selectedClip) return;
    await mutateTimeline(async () => {
      const db = await import('./lib/db');
      await db.updateClipEffects(selectedClip.id, effects);
    });
  }, [selectedClip, mutateTimeline]);

  const handleClearTimeline = useCallback(async () => {
    if (!project?.id) return;
    if (!confirm('Clear the entire timeline?')) return;
    await mutateTimeline(async () => {
      const db = await import('./lib/db');
      await db.clearTimelineClips(project.id);
    });
    setSelectedClipIds([]);
  }, [project?.id, mutateTimeline]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!project?.id || active.data.current?.type !== 'Asset') return;
    const asset = active.data.current.asset;
    let trackType: 'video' | 'audio' | 'text' = 'video';
    if (over?.id === 'timeline-audio-droppable') trackType = 'audio';
    else if (asset.type === 'audio') trackType = 'audio';
    else if (asset.type === 'text') trackType = 'text';
    await handleAddClip(asset, trackType);
  }, [project?.id, handleAddClip]);

  const videoDuration = useMemo(() =>
    timelineClips.reduce((max, c) => Math.max(max, c.timeline_start + (c.end_time - c.start_time)), 0),
    [timelineClips]
  );

  const handleExport = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) return alert("❌ Please run 'npm run tauri dev' to export.");
    if (timelineClips.length === 0) return alert('⚠️ Add media before exporting.');

    setIsRendering(true);
    try {
      const payload = {
        clips: timelineClips,
        transitions,
        fontFamily: features?.fontFamily || 'Arial',
        animationStyle: 'hormozi',
        captionX: features?.captionX || 0,
        captionY: features?.captionY || 80,
        durationInFrames: Math.max(1, Math.round(videoDuration * 30))
      };
      await invoke('run_render_pipeline', { payloadJson: JSON.stringify(payload) });
      alert('✅ Export Successful!');
    } catch (err: any) {
      alert(`❌ Export Failed: ${err?.message || err}`);
    } finally {
      setIsRendering(false);
    }
  }, [timelineClips, transitions, features, videoDuration]);
  
  const handleGlobalImport = useCallback(async () => {
    if (!project?.id) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
      const db = await import('./lib/db');

      const file = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg'] }],
      });
      const filePath = typeof file === 'string' ? file : (file as any)?.path ?? (Array.isArray(file) ? file[0] : null);
      if (!filePath) return;

      let duration = 0;
      try {
        duration = await Promise.race([
          invoke<any>('get_video_duration', { videoPath: filePath }).then(r => parseFloat(r)),
          new Promise<number>((_, reject) => setTimeout(() => reject('timeout'), 1500))
        ]).catch(() => 0);
      } catch { }

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
      if (isNaN(duration) || duration <= 0) duration = 5.0;

      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const assetType = isAudio ? 'audio' : isImage ? 'image' : 'video';

      const asset = await db.addAsset(project.id, filePath, assetType, duration);
      await handleAddClip(asset, isAudio ? 'audio' : 'video');
    } catch (e) {
      console.error('Global import failed:', e);
    }
  }, [project?.id, handleAddClip]);

  // ─── Global Keyboard Shortcuts ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (history.canRedo) history.redo(); }
        else { if (history.canUndo) history.undo(); }
        setSelectedClipIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  const onUndo = useCallback(() => { history.undo(); setSelectedClipIds([]); }, [history]);
  const onRedo = useCallback(() => { history.redo(); setSelectedClipIds([]); }, [history]);

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
      <div className="app-shell">
        <div className="layout-topbar">
          <TopNav
            isRendering={isRendering}
            onExport={handleExport}
            onClearTimeline={handleClearTimeline}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
          />
        </div>

        <div className="layout-rail">
          <IconRail activeTab={activeToolTab} onTabChange={setActiveToolTab} />
        </div>

        <div className="layout-left">
          {/* UX NOTE: Use CSS visibility or a tab panel to avoid remounting */}
          <div style={{ display: activeToolTab === 'transitions' ? 'contents' : 'none' }}>
            <TransitionsSidebar selectedClipId={selectedClip?.id.toString() ?? null} onApply={handleApplyTransition} />
          </div>
          <div style={{ display: activeToolTab === 'effects' ? 'contents' : 'none' }}>
            <EffectsSidebar selectedClipId={selectedClip?.id.toString() ?? null} currentEffects={currentEffects} onApply={handleApplyEffects} />
          </div>
          <div style={{ display: activeToolTab === 'media' ? 'contents' : 'none' }}>
            <MediaSidebar projectId={project?.id} onMediaSelected={() => { }} onMediaAdded={() => { }} highlightAssetId={highlightAssetId} onHighlightClear={() => setHighlightAssetId(null)} />
          </div>
        </div>

        <div className="layout-center">
          <PreviewWindow
            clips={timelineClips}
            transitions={transitions}
            features={features}
            setFeatures={setFeatures}
            playheadSeconds={playheadSeconds}
            onPlayheadChange={setPlayheadSeconds}
            playheadDomRef={playheadDomRef}
            timecodeDomRef={timecodeDomRef}
            pps={pps}
            videoDuration={videoDuration}
            engineTimeRef={engineTimeRef}
            onTimelineChange={handleTimelineChange}
            styleOverrides={styleOverride}
            projectId={project?.id}
          />

          <Timeline
            clips={timelineClips}
            videoDuration={videoDuration}
            selectedClipIds={selectedClipIds}
            onClipSelected={setSelectedClipIds}
            playheadSeconds={playheadSeconds}
            onPlayheadChange={setPlayheadSeconds}
            onTimelineChange={handleTimelineChange}
            onBeforeChange={onBeforeChange}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            markers={markers}
            projectId={project?.id ?? null}
            onMarkersChange={handleMarkersChange}
            playheadDomRef={playheadDomRef}
            onPpsChange={setPps}
            timecodeDomRef={timecodeDomRef}
            onRevealAsset={setHighlightAssetId}
            engineTimeRef={engineTimeRef}
            onAddMedia={handleGlobalImport}
          />
        </div>

        <div className="layout-right">
          <PropertiesPanel
            onFeaturesChange={setFeatures}
            selectedClip={selectedClip}
            onTimelineChange={handleTimelineChange}
            onSilentRefresh={handleSilentRefresh}
            onBeforeChange={onBeforeChange}
            onLiveClipUpdate={handleLiveClipUpdate}
            playheadSeconds={playheadSeconds}
            onStylePreview={(id, style) => setStyleOverride(id && style ? { clipId: id, style } : null)}
          />
        </div>
      </div>
    </DndContext>
  );
}