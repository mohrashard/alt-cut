import { useRef, useState, useEffect, useMemo, useCallback, memo, Component, ReactNode } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HormoziCaptions } from "../remotion/HormoziCaptions";
import { AppFeatures } from "./PropertiesPanel";
import type { TimelineClip, Transition } from "../lib/db";

// ═══════════════════════════════════════════════════════════════
// 1. RESETTABLE ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (props: { onReset: () => void }) => ReactNode;
}

class RemotionErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    console.error("Remotion Render Error:", error, info);
  }
  private handleReset = () => this.setState({ hasError: false });
  render() {
    return this.state.hasError
      ? this.props.fallback({ onReset: this.handleReset })
      : this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. CUSTOM HOOKS
// ═══════════════════════════════════════════════════════════════

function useFrameAccurateTimecode(fps: number) {
  return useCallback((seconds: number) => {
    const totalFrames = Math.max(0, Math.floor(seconds * fps));
    const m = Math.floor(totalFrames / (fps * 60));
    const s = Math.floor((totalFrames % (fps * 60)) / fps);
    const f = totalFrames % fps;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }, [fps]);
}

interface UseCaptionDragOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  captionX: number;
  captionY: number;
  onChange: (pos: { x: number; y: number }) => void;
}

function useCaptionDrag({ containerRef, captionX, captionY, onChange }: UseCaptionDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const displayX = dragPos?.x ?? captionX;
  const displayY = dragPos?.y ?? captionY;

  const getSnapped = useCallback((rawX: number, rawY: number) => {
    let x = Math.max(-50, Math.min(50, rawX));
    let y = Math.max(0, Math.min(100, rawY));
    const snaps = { x: [] as number[], y: [] as number[] };

    // Horizontal snaps (captionX is offset from center in %)
    if (Math.abs(x) < 2.5) { x = 0; snaps.x.push(0); }
    if (Math.abs(x - (-33)) < 2.5) { x = -33; snaps.x.push(-33); }
    if (Math.abs(x - 33) < 2.5) { x = 33; snaps.x.push(33); }

    // Vertical snaps
    if (Math.abs(y - 50) < 2.5) { y = 50; snaps.y.push(50); }
    if (Math.abs(y - 33) < 2.5) { y = 33; snaps.y.push(33); }
    if (Math.abs(y - 66) < 2.5) { y = 66; snaps.y.push(66); }

    return { x, y, snaps };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;

    const onMove = (me: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const rect = containerRef.current!.getBoundingClientRect();
        const relX = (me.clientX - rect.left) / rect.width;
        const relY = (me.clientY - rect.top) / rect.height;
        const rawX = Math.round((relX - 0.5) * 100);
        const rawY = Math.round(relY * 100);
        const { x, y } = getSnapped(rawX, rawY);
        setDragPos({ x, y });
      });
    };

    const onUp = () => {
      isDraggingRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';

      setIsDragging(false);
      setDragPos(prev => {
        if (prev) onChange({ x: prev.x, y: prev.y });
        return null;
      });
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [containerRef, getSnapped, onChange]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { startDrag, isDragging, displayX, displayY };
}

// ═══════════════════════════════════════════════════════════════
// 3. COMPONENT
// ═══════════════════════════════════════════════════════════════

interface PreviewWindowProps {
  clips: TimelineClip[];
  transitions: Transition[];
  features: AppFeatures | null;
  setFeatures: (f: AppFeatures | null | ((prev: AppFeatures | null) => AppFeatures | null)) => void;
  videoDuration?: number;
  playheadSeconds?: number;
  onPlayheadChange?: (sec: number) => void;
  playheadDomRef?: React.RefObject<HTMLDivElement | null>;
  timecodeDomRef?: React.RefObject<HTMLSpanElement | null>;
  pps?: number;
  engineTimeRef?: React.MutableRefObject<number>;
  onTimelineChange?: () => void;
  styleOverrides?: { clipId: number | string; style: any } | null;
  projectId?: number;
}

export const PreviewWindow = memo(function PreviewWindow({
  clips, transitions, features, setFeatures, videoDuration = 0, playheadSeconds = 0,
  onPlayheadChange, playheadDomRef, timecodeDomRef, pps = 80,
  engineTimeRef, onTimelineChange, styleOverrides
}: PreviewWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [playerMounted, setPlayerMounted] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const previewTimecodeRef = useRef<HTMLSpanElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const fmtTime = useFrameAccurateTimecode(30);

  const setPlayerRef = useCallback((node: PlayerRef | null) => {
    playerRef.current = node;
    setPlayerMounted(!!node);
  }, []);

  // Memoized asset URLs
  const previewClips = useMemo(() =>
    clips.map(c => ({ ...c, previewSrc: c.file_path ? convertFileSrc(c.file_path) : null })),
    [clips]
  );

  const captionX = features?.captionX ?? 0;
  const captionY = features?.captionY ?? 80;

  // Only notify parent when drag ends (zero parent re-renders during drag)
  const handleCaptionChange = useCallback((pos: { x: number; y: number }) => {
    setFeatures(prev => prev ? { ...prev, captionX: pos.x, captionY: pos.y } : prev);
  }, [setFeatures]);

  const { startDrag, isDragging, displayX, displayY } = useCaptionDrag({
    containerRef,
    captionX,
    captionY,
    onChange: handleCaptionChange
  });

  // Stable inputProps — CRITICAL to prevent Remotion remounting
  const inputProps = useMemo(() => ({
    clips: previewClips,
    transitions,
    captionX: displayX,
    captionY: displayY,
    onTimelineChange,
    styleOverrides
  }), [previewClips, transitions, displayX, displayY, onTimelineChange, styleOverrides]);

  const playerDuration = Math.max(1, Math.round(videoDuration * 30));

  // ═══ Conditional RAF Loop (only when player exists) ═══
  useEffect(() => {
    if (!playerMounted || !playerRef.current) return;
    const player = playerRef.current;
    let raf: number;

    const loop = () => {
      const frame = player.getCurrentFrame();
      const sec = frame / 30;

      if (engineTimeRef) engineTimeRef.current = sec;
      if (playheadDomRef?.current && !playheadDomRef.current.dataset.playheadDragging) {
        playheadDomRef.current.style.left = `${sec * pps}px`;
      }
      const text = `${fmtTime(sec)} / ${fmtTime(videoDuration)}`;
      if (timecodeDomRef?.current) timecodeDomRef.current.textContent = text;
      if (previewTimecodeRef.current) previewTimecodeRef.current.textContent = text;

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playerMounted, pps, videoDuration, engineTimeRef, playheadDomRef, timecodeDomRef, fmtTime]);

  // ═══ Sync external playhead (only when paused) ═══
  useEffect(() => {
    const player = playerRef.current;
    if (!player || videoDuration <= 0 || player.isPlaying()) return;
    const target = Math.round(playheadSeconds * 30);
    if (Math.abs(player.getCurrentFrame() - target) > 1) {
      player.seekTo(target);
    }
  }, [playheadSeconds, videoDuration]);

  // ═══ Player listeners ═══
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPause = () => {
      setIsPlaying(false);
      onPlayheadChange?.(player.getCurrentFrame() / 30);
    };
    const onPlay = () => setIsPlaying(true);
    player.addEventListener('pause', onPause);
    player.addEventListener('play', onPlay);
    return () => {
      player.removeEventListener('pause', onPause);
      player.removeEventListener('play', onPlay);
    };
  }, [onPlayheadChange, playerMounted]);

  // ═══ Keyboard shortcuts ═══
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.isPlaying() ? p.pause() : p.play();
  }, []);

  const skipBack = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(Math.max(0, p.getCurrentFrame() - 30));
  }, []);

  const skipForward = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(Math.min(playerDuration - 1, p.getCurrentFrame() + 30));
  }, [playerDuration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); skipBack(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); skipForward(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skipBack, skipForward]);

  const hasCaptions = useMemo(() =>
    clips.some(c => c.ai_metadata?.['captions']?.status === 'completed' || c.track_type === 'text'),
    [clips]
  );

  return (
    <div className="preview-area">
      {clips.length === 0 ? (
        <div className="preview-empty">
          <div className="preview-empty-icon">🎬</div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>
            No clips yet
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '4px' }}>
            Import a video from the media panel, then drag it into the timeline below.
          </div>
        </div>
      ) : (
        <div className="pw-layout">
          <div className="pw-info-strip">1080×1920 · 30 FPS</div>

          {/* Flex 9:16 wrapper — flex:1 claims height, aspect-ratio drives width */}
          <div
            className={`pw-player-wrapper ${isDragging ? 'dragging' : ''}`}
            ref={containerRef}
            style={{
              aspectRatio: '9/16',
              flex: '1 1 auto',
              minHeight: 0,
              width: 'auto',
              maxWidth: '100%',
              alignSelf: 'center',
            }}
          >
            <RemotionErrorBoundary
              key={playerKey}
              fallback={({ onReset }) => (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 12, height: '100%', color: '#ff6b6b'
                }}>
                  <span>⚠️ Render error – check console</span>
                  <button
                    onClick={() => { setPlayerKey(k => k + 1); onReset(); }}
                    style={{
                      padding: '6px 16px', background: 'var(--ac-accent)', color: '#fff',
                      border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
            >
              <Player
                key={playerKey}
                ref={setPlayerRef}
                component={HormoziCaptions as any}
                inputProps={inputProps}
                durationInFrames={playerDuration}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={30}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                autoPlay
                loop
                renderLoading={() => (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'var(--text-secondary)', fontSize: 12
                  }}>
                    Loading preview…
                  </div>
                )}
              />
            </RemotionErrorBoundary>

            {hasCaptions && (
              <div
                onMouseDown={startDrag}
                style={{
                  position: 'absolute',
                  top: `${displayY}%`,
                  left: `${50 + displayX}%`,
                  width: '85%',
                  height: 80,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 100,
                  border: isDragging ? '2px solid var(--ac-accent)' : '1.5px dashed rgba(255,255,255,0.3)',
                  borderRadius: 4,
                  backgroundColor: isDragging ? 'rgba(124, 92, 252, 0.1)' : 'transparent',
                  boxShadow: isDragging ? '0 0 20px rgba(124, 92, 252, 0.3)' : 'none',
                  pointerEvents: 'auto',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transition: isDragging ? 'none' : 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Corner handles */}
                {[
                  { t: -3, l: -3 }, { t: -3, r: -3 },
                  { b: -3, l: -3 }, { b: -3, r: -3 }
                ].map((pos, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    top: pos.t, left: pos.l, right: pos.r, bottom: pos.b,
                    width: 6, height: 6, background: '#fff',
                    border: '1px solid var(--ac-accent)', borderRadius: 1
                  }} />
                ))}

                {/* Snap Guides (CapCut-style) */}
                {isDragging && Math.abs(displayX) < 0.5 && (
                  <div style={{
                    position: 'absolute', left: '50%', top: '-50%', bottom: '-50%',
                    width: 1, background: 'var(--ac-accent)', opacity: 0.6,
                    pointerEvents: 'none', transform: 'translateX(-50%)'
                  }} />
                )}
                {isDragging && Math.abs(displayY - 50) < 0.5 && (
                  <div style={{
                    position: 'absolute', top: '50%', left: '-10%', right: '-10%',
                    height: 1, background: 'var(--ac-accent)', opacity: 0.6,
                    pointerEvents: 'none', transform: 'translateY(-50%)'
                  }} />
                )}

                {/* Position tooltip */}
                <div style={{
                  position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
                  color: '#fff', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  pointerEvents: 'none', whiteSpace: 'nowrap', background: 'var(--ac-accent)',
                  padding: '2px 8px', borderRadius: 4, opacity: isDragging ? 1 : 0,
                  transition: 'opacity 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                  {`X: ${displayX}  Y: ${displayY}`}
                </div>
              </div>
            )}
          </div>

          <div className="pw-controls">
            <button className="pw-btn" onClick={skipBack} title="Back 1s (←)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>
            <button className="pw-btn-play" onClick={togglePlay} title="Play/Pause (Space)">
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>
            <button className="pw-btn" onClick={skipForward} title="Forward 1s (→)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
            <span className="pw-timecode" ref={previewTimecodeRef}>00:00:00 / 00:00:00</span>
          </div>
        </div>
      )}
    </div>
  );
});