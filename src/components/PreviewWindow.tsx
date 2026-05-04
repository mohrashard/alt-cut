import { useRef, useState, useEffect, useMemo } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HormoziCaptions } from "../remotion/HormoziCaptions";
import { AppFeatures } from "./PropertiesPanel";
import type { TimelineClip, Transition } from "../lib/db";

interface PreviewWindowProps {
  clips: TimelineClip[];
  features: AppFeatures | null;
  setFeatures: (f: AppFeatures) => void;
  videoDuration?: number;
  playheadSeconds?: number;
  onPlayheadChange?: (sec: number) => void;
  // Ref to the playhead DOM node for zero-re-render position updates
  playheadDomRef?: React.RefObject<HTMLDivElement | null>;
  // Ref to the timecode span for zero-re-render text updates
  timecodeDomRef?: React.RefObject<HTMLSpanElement | null>;
  pps?: number;
  engineTimeRef?: React.MutableRefObject<number>;
  onTimelineChange?: () => void;
}

export function PreviewWindow({
  clips, features, setFeatures, videoDuration = 0, playheadSeconds = 0,
  onPlayheadChange, playheadDomRef, timecodeDomRef, pps = 80,
  engineTimeRef, onTimelineChange
}: PreviewWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<PlayerRef>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transitions, setTransitions] = useState<Transition[]>([]);

  const previewTimecodeRef = useRef<HTMLSpanElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    import('../lib/db').then(db => {
      db.getAllTransitions().then(setTransitions);
    });
  }, [clips]);

  const videoDurationRef = useRef(videoDuration);
  useEffect(() => { videoDurationRef.current = videoDuration; }, [videoDuration]);

  // ── RAF loop: pure DOM mutation, zero React state updates during playback ──
  useEffect(() => {
    const fmtTime = (s: number) => {
      const m  = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      const ms = Math.floor((s % 1) * 10);
      return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${ms}`;
    };

    let raf: number;
    const loop = () => {
      if (playerRef.current) {
        const currentFrame = playerRef.current.getCurrentFrame();
        const sec = currentFrame / 30;
        
        if (engineTimeRef) {
          engineTimeRef.current = sec;
        }

        if (playheadDomRef?.current && !playheadDomRef.current.dataset.playheadDragging) {
          playheadDomRef.current.style.left = `${sec * pps}px`;
        }

        const text = `${fmtTime(sec)} / ${fmtTime(videoDurationRef.current)}`;
        if (timecodeDomRef?.current) {
          timecodeDomRef.current.textContent = text;
        }
        if (previewTimecodeRef.current) {
          previewTimecodeRef.current.textContent = text;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadDomRef, timecodeDomRef, pps, engineTimeRef]);
  // videoDuration intentionally excluded — fmtTime captures it via closure ref below

  // ── Sync React state on pause only (via Remotion's event API) ──
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    
    const onPause = () => {
      setIsPlaying(false);
      if (onPlayheadChange) {
        onPlayheadChange(player.getCurrentFrame() / 30);
      }
    };
    
    const onPlay = () => setIsPlaying(true);

    player.addEventListener('pause', onPause);
    player.addEventListener('play', onPlay);
    return () => {
      player.removeEventListener('pause', onPause);
      player.removeEventListener('play', onPlay);
    };
  }, [onPlayheadChange]);

  // ── External seek (ruler click / drag): seek the player when paused ──
  useEffect(() => {
    if (!playerRef.current || videoDuration <= 0) return;
    if (playerRef.current.isPlaying()) return; 
    const frame = Math.round(playheadSeconds * 30);
    const current = playerRef.current.getCurrentFrame();
    if (Math.abs(current - frame) > 1) {
      playerRef.current.seekTo(frame);
    }
  }, [playheadSeconds, videoDuration]);

  const previewClips = useMemo(() => clips.map(clip => ({
    ...clip,
    previewSrc: clip.file_path ? convertFileSrc(clip.file_path) : null,
  })), [clips]);

  const inputProps = useMemo(() => {
    return {
      clips: previewClips,
      transitions,
      captionX: features?.captionX || 0,
      captionY: features?.captionY || 80,
      onTimelineChange,
    };
  }, [previewClips, features, transitions, onTimelineChange]);

  const playerDuration = Math.max(1, Math.round(videoDuration * 30));

  const handleHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) updatePosition(e);
  };

  const handleMouseUp = () => setIsDragging(false);

  const updatePosition = (e: React.MouseEvent) => {
    if (!containerRef.current || !features) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const newX = Math.round((relX - 0.5) * 100);
    const newY = Math.round(relY * 100);
    setFeatures({
      ...features,
      captionX: Math.max(-50, Math.min(50, newX)),
      captionY: Math.max(0, Math.min(100, newY)),
    });
  };

  const hasCaptions = clips.some(c => c.ai_metadata?.['captions']?.status === 'completed');
  
  const togglePlay = () => {
    if (playerRef.current?.isPlaying()) {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const skipBack = () => {
    const p = playerRef.current;
    if (p) p.seekTo(Math.max(0, p.getCurrentFrame() - 30));
  };

  const skipForward = () => {
    const p = playerRef.current;
    if (p) p.seekTo(Math.min(playerDuration, p.getCurrentFrame() + 30));
  };

  return (
    <div className="preview-area">
      {clips.length > 0 ? (
        <div className="pw-layout">
          <div className="pw-info-strip">1080×1920  ·  30 FPS</div>

          <div
            className={`pw-player-wrapper ${isDragging ? 'dragging' : ''}`}
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <Player
              ref={playerRef}
              component={HormoziCaptions as any}
              inputProps={inputProps}
              durationInFrames={playerDuration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{ width: '200px', height: '356px' }}
              controls={false}
              autoPlay
              loop
            />

            {/* Caption drag handle */}
            {hasCaptions && (
              <div
                style={{
                  position: 'absolute',
                  top: `${features?.captionY ?? 80}%`,
                  left: `${50 + (features?.captionX ?? 0)}%`,
                  width: '85%',
                  height: '80px',
                  border: isDragging
                    ? '2px solid #ffcc00'
                    : '1px dashed rgba(255,204,0,0.4)',
                  borderRadius: '4px',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 100,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isDragging ? '0 0 15px rgba(255,204,0,0.4)' : 'none',
                  backgroundColor: 'rgba(255,204,0,0.02)',
                }}
              >
                <div 
                  onMouseDown={handleHandleMouseDown}
                  style={{
                    color: isDragging ? '#ffcc00' : 'rgba(255,204,0,0.6)',
                    fontSize: '8px',
                    position: 'absolute',
                    top: '-15px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    cursor: 'move',
                    pointerEvents: 'auto',
                    background: 'var(--ac-bg-base)',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    border: '1px solid rgba(255,204,0,0.2)'
                  }}
                >
                  {isDragging ? 'Moving...' : 'Drag to move'}
                </div>
              </div>
            )}
          </div>

          <div className="pw-controls">
            <button className="pw-btn" onClick={skipBack} title="Back 1s">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
            </button>
            
            <button className="pw-btn-play" onClick={togglePlay} title="Play/Pause">
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              )}
            </button>
            
            <button className="pw-btn" onClick={skipForward} title="Forward 1s">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            </button>
            
            <span className="pw-timecode" ref={previewTimecodeRef}>00:00.0 / 00:00.0</span>
          </div>

        </div>
      ) : (
        <div className="preview-empty">
          <div className="preview-empty-icon">🎬</div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>No clips yet</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '4px' }}>
            Import a video from the media panel, then drag it into the timeline below.
          </div>
        </div>
      )}
    </div>
  );
}

