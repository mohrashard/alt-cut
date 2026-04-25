import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core';
import type { TimelineClip, Marker } from './lib/db';

import { TopNav } from "./components/TopNav";
import { MediaSidebar } from "./components/MediaSidebar";
import { PreviewWindow } from "./components/PreviewWindow";
import { PropertiesPanel, AppFeatures } from "./components/PropertiesPanel";
import { Timeline } from "./components/Timeline";
import "./App.css";

// ─── Toolbar Icon Components ─────────────────────────────────
const MediaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="3"/><path d="M10 8l6 4-6 4V8z"/>
  </svg>
);
const AudioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>
);
const TextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
);
const StickerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>
  </svg>
);
const EffectsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const TransitionsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3l14 9-14 9V3z" opacity="0.4"/><path d="M19 3v18"/>
  </svg>
);
const CaptionsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h3m4 0h3M7 11h10"/>
  </svg>
);
const FiltersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>
);
const AdjustIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);
const TemplatesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
const AiIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
  </svg>
);

const TOOLBAR_TABS = [
  { id: 'media', label: 'Media', Icon: MediaIcon },
  { id: 'audio', label: 'Audio', Icon: AudioIcon },
  { id: 'text', label: 'Text', Icon: TextIcon },
  { id: 'stickers', label: 'Stickers', Icon: StickerIcon },
  { id: 'effects', label: 'Effects', Icon: EffectsIcon },
  { id: 'transitions', label: 'Transitions', Icon: TransitionsIcon },
  { id: 'captions', label: 'Captions', Icon: CaptionsIcon },
  { id: 'filters', label: 'Filters', Icon: FiltersIcon },
  { id: 'adjustment', label: 'Adjustment', Icon: AdjustIcon },
  { id: 'templates', label: 'Templates', Icon: TemplatesIcon },
  { id: 'ai', label: 'AI avatar', Icon: AiIcon },
];

// ─── App ─────────────────────────────────────────────────────
function App() {
  const [isRendering, setIsRendering] = useState(false);
  const [features, setFeatures] = useState<AppFeatures | null>(null);
  const [activeToolTab, setActiveToolTab] = useState('media');
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [pps, setPps] = useState(80); // mirrors Timeline's pps for PreviewWindow
  const playheadDomRef = useRef<HTMLDivElement | null>(null);
  const timecodeDomRef = useRef<HTMLSpanElement | null>(null);

  const [currentProject, setCurrentProject] = useState<any>(null);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<number[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);

  // ── Undo/Redo history (ref-based to avoid re-render on push) ─
  const historyRef      = useRef<TimelineClip[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const selectedClips = timelineClips.filter(c => selectedClipIds.includes(c.id));
  const selectedClip = selectedClips.length === 1 ? selectedClips[0] : null;

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
        const trackType = asset.type === 'audio' ? 'audio' : 'video';
        await db.addClipToTimeline(currentProject.id, asset.id, dur, trackType, 0);
      }
      await loadTimeline(currentProject.id);
    }
  };

  const videoDuration = timelineClips.length > 0
    ? timelineClips[timelineClips.length - 1].timeline_start +
      (timelineClips[timelineClips.length - 1].end_time - timelineClips[timelineClips.length - 1].start_time)
    : 0;

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
        <TopNav isRendering={isRendering} onExport={handleExport} />

        {/* Toolbar */}
        <div className="toolbar">
          {TOOLBAR_TABS.map(tab => (
            <button
              key={tab.id}
              className={`toolbar-tab ${activeToolTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveToolTab(tab.id)}
              title={tab.label}
            >
              <tab.Icon />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Editor Body */}
        <div className="editor-body">

          {/* Left Sidebar */}
          <MediaSidebar
            projectId={currentProject?.id}
            onMediaSelected={handleMediaSelected}
            onMediaAdded={handleMediaAdded}
          />

          {/* Center Workspace */}
          <div className="workspace">
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
            />

            {/* Timeline */}
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
            />
          </div>

          {/* Right Panel */}
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
