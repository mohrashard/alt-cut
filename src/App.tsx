import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core';
import type { TimelineClip, Marker, ClipEffects } from './lib/db';

import { TopNav } from "./components/TopNav";
import { IconRail } from "./components/IconRail";
import { MediaSidebar } from "./components/MediaSidebar";
import { PreviewWindow } from "./components/PreviewWindow";
import { PropertiesPanel, AppFeatures } from "./components/PropertiesPanel";
import { Timeline } from "./components/Timeline";
import { TransitionsSidebar } from "./components/TransitionsSidebar";
import { EffectsSidebar } from "./components/EffectsSidebar";
import "./App.css";

// ─── App ─────────────────────────────────────────────────────
function App() {
  const [isRendering, setIsRendering] = useState(false);
  const [features, setFeatures] = useState<AppFeatures | null>(null);
  const [activeToolTab, setActiveToolTab] = useState('media');
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [pps, setPps] = useState(80); // mirrors Timeline's pps for PreviewWindow
  const playheadDomRef = useRef<HTMLDivElement | null>(null);
  const timecodeDomRef = useRef<HTMLSpanElement | null>(null);
  const engineTimeRef = useRef<number>(0);

  const [currentProject, setCurrentProject] = useState<any>(null);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<number[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [highlightAssetId, setHighlightAssetId] = useState<number | null>(null);

  // ── Undo/Redo history (ref-based to avoid re-render on push) ─
  const historyRef      = useRef<TimelineClip[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const selectedClips = timelineClips.filter(c => selectedClipIds.includes(c.id));
  const selectedClip = selectedClips.length === 1 ? selectedClips[0] : null;

  const currentEffectsRaw = selectedClip?.effects;
  const currentEffects: ClipEffects = useMemo(() => {
    const defaultEffects = { brightness: 1.0, contrast: 1.0, saturation: 1.0, blur: 0, sharpen: 0 };
    try {
      return { ...defaultEffects, ...JSON.parse(currentEffectsRaw || '{}') };
    } catch {
      return defaultEffects;
    }
  }, [currentEffectsRaw]);

  // Push current clips to the history stack before a mutation
  const pushHistory = useCallback((clips: TimelineClip[]) => {
    // Trim any forward (redo) history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(clips)));
    historyIndexRef.current = historyRef.current.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const loadMarkers = useCallback(async (projectId: number) => {
    const db = await import('./lib/db');
    const m = await db.getMarkers(projectId);
    setMarkers(m);
  }, []);

  const loadTimeline = useCallback(async (projectId: number) => {
    const db = await import('./lib/db');
    const clips = await db.getTimelineClips(projectId);
    setTimelineClips(clips);
    await loadMarkers(projectId);
  }, [loadMarkers]);

  const handleUndo = useCallback(async () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const prevState = historyRef.current[historyIndexRef.current];
    const db = await import('./lib/db');
    if (currentProject) {
      await db.restoreTimelineClips(currentProject.id, prevState);
      setTimelineClips(prevState);
    }
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }, [currentProject]);

  const handleRedo = useCallback(async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const nextState = historyRef.current[historyIndexRef.current];
    const db = await import('./lib/db');
    if (currentProject) {
      await db.restoreTimelineClips(currentProject.id, nextState);
      setTimelineClips(nextState);
    }
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, [currentProject]);

  useEffect(() => {
    import('./lib/db').then(async (db) => {
      try {
        await db.runMigrations();
        const project = await db.ensureDefaultProject();
        setCurrentProject(project);
        const clips = await db.getTimelineClips(project.id);
        setTimelineClips(clips);
        await loadMarkers(project.id);
        // Seed history with the initial loaded state
        historyRef.current = [JSON.parse(JSON.stringify(clips))];
        historyIndexRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
      } catch (err) {
        console.error('Failed to load project from DB:', err);
      }
    });
  }, [loadMarkers]);

  const handleMediaAdded = (_filePath: string) => { /* no-op */ };
  const handleMediaSelected = (_path: string) => { /* no-op */ };

  const handleApplyTransition = useCallback(async (transitionType: string) => {
    if (!selectedClip) return;
    const db = await import('./lib/db');
    
    const sameTrackClips = timelineClips.filter(
      c => c.track_type === selectedClip.track_type && c.track_lane === selectedClip.track_lane
    ).sort((a, b) => a.timeline_start - b.timeline_start);
    
    const currentIndex = sameTrackClips.findIndex(c => c.id === selectedClip.id);
    if (currentIndex <= 0) {
      alert("Transitions require a preceding clip on the same track.");
      return;
    }
    const prevClip = sameTrackClips[currentIndex - 1];

    if (transitionType === 'none') {
      await db.deleteTransition(prevClip.id, selectedClip.id);
    } else {
      await db.upsertTransition({
        track_id: selectedClip.track_lane,
        clip_a_id: prevClip.id,
        clip_b_id: selectedClip.id,
        type: transitionType as any,
        duration_frames: 15,
      });
    }
  }, [selectedClip, timelineClips]);

  const handleApplyEffects = useCallback(async (effects: ClipEffects) => {
    if (!selectedClip) return;
    const db = await import('./lib/db');
    await db.updateClipEffects(selectedClip.id, effects);
    if (currentProject) {
      await loadTimeline(currentProject.id);
    }
  }, [selectedClip, currentProject, loadTimeline]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!currentProject) return;

    if (active.data.current?.type === 'Asset') {
      const asset = active.data.current.asset;
      const db = await import('./lib/db');
      const dur = asset.duration > 0 ? asset.duration : 1.0;

      pushHistory(timelineClips); // snapshot before mutation

      if (over?.id === 'timeline-audio-droppable') {
        await db.addClipToTimeline(currentProject.id, asset.id, dur, 'audio', 0);
      } else if (over?.id === 'timeline-droppable') {
        const trackType = asset.type === 'audio' ? 'audio' : (asset.type === 'text' ? 'text' : 'video');
        await db.addClipToTimeline(currentProject.id, asset.id, dur, trackType, 0);
      }
      await loadTimeline(currentProject.id);
    }
  };

  // Compute the true end-time across ALL clips regardless of track order
  const videoDuration = timelineClips.reduce((max, c) => {
    const end = c.timeline_start + (c.end_time - c.start_time);
    return end > max ? end : max;
  }, 0);

  const handleClearTimeline = useCallback(async () => {
    if (!currentProject) return;
    if (!confirm('Clear the entire timeline? This cannot be undone.')) return;
    const db = await import('./lib/db');
    await db.clearTimelineClips(currentProject.id);
    setTimelineClips([]);
    setSelectedClipIds([]);
    historyRef.current = [[]];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
  }, [currentProject]);

  const handleExport = async () => {
    if (!(window as any).__TAURI_INTERNALS__) {
      alert("❌ Run 'npm run tauri dev' to export.");
      return;
    }
    if (timelineClips.length === 0) {
      alert('⚠️ Add media to the timeline before exporting.');
      return;
    }
    setIsRendering(true);
    try {
      const payload = {
        clips: timelineClips,
        fontFamily: features?.fontFamily || 'Arial',
        animationStyle: features?.animationStyle || 'hormozi',
        captionX: features?.captionX || 0,
        captionY: features?.captionY || 80,
        durationInFrames: Math.max(1, Math.round(videoDuration * 30))
      };
      await invoke('run_render_pipeline', { payloadJson: JSON.stringify(payload) });
      alert('✅ Export Successful!');
    } catch (error) {
      alert(`❌ Export Failed: ${error}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
      <div className="app-shell">

        {/* Top Nav */}
        <div className="layout-topbar">
          <TopNav
            isRendering={isRendering}
            onExport={handleExport}
            onClearTimeline={handleClearTimeline}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>

        {/* Icon Rail */}
        <div className="layout-rail">
          <IconRail
            activeTab={activeToolTab}
            onTabChange={setActiveToolTab}
          />
        </div>

        {/* Left Sidebar */}
        <div className="layout-left">
          {activeToolTab === 'transitions' ? (
            <TransitionsSidebar
              selectedClipId={selectedClip?.id ? String(selectedClip.id) : null}
              onApply={handleApplyTransition}
            />
          ) : activeToolTab === 'effects' ? (
            <EffectsSidebar
              selectedClipId={selectedClip?.id ? String(selectedClip.id) : null}
              currentEffects={currentEffects}
              onApply={handleApplyEffects}
            />
          ) : (
            <MediaSidebar
              projectId={currentProject?.id}
              onMediaSelected={handleMediaSelected}
              onMediaAdded={handleMediaAdded}
              highlightAssetId={highlightAssetId}
              onHighlightClear={() => setHighlightAssetId(null)}
            />
          )}
        </div>

        {/* Center Workspace */}
        <div className="layout-center">
          <PreviewWindow
            clips={timelineClips}
            features={features}
            setFeatures={setFeatures}
            playheadSeconds={playheadSeconds}
            onPlayheadChange={setPlayheadSeconds}
            playheadDomRef={playheadDomRef}
            timecodeDomRef={timecodeDomRef}
            pps={pps}
            videoDuration={videoDuration}
            engineTimeRef={engineTimeRef}
          />

          <Timeline
            clips={timelineClips}
            videoDuration={videoDuration}
            selectedClipIds={selectedClipIds}
            onClipSelected={setSelectedClipIds}
            playheadSeconds={playheadSeconds}
            onPlayheadChange={setPlayheadSeconds}
            onTimelineChange={() => currentProject && loadTimeline(currentProject.id)}
            onBeforeChange={() => pushHistory(timelineClips)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            markers={markers}
            projectId={currentProject?.id ?? null}
            onMarkersChange={() => currentProject && loadMarkers(currentProject.id)}
            playheadDomRef={playheadDomRef}
            onPpsChange={setPps}
            timecodeDomRef={timecodeDomRef}
            onRevealAsset={setHighlightAssetId}
            engineTimeRef={engineTimeRef}
          />
        </div>

        {/* Right Panel */}
        <div className="layout-right">
          <PropertiesPanel
            onFeaturesChange={setFeatures}
            selectedClip={selectedClip}
            onTimelineChange={() => currentProject && loadTimeline(currentProject.id)}
          />
        </div>

      </div>
    </DndContext>
  );
}

export default App;
