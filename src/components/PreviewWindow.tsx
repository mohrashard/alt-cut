import { useRef, useState, useEffect, useMemo } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HormoziCaptions } from "../remotion/HormoziCaptions";
import { AppFeatures } from "./PropertiesPanel";
import type { TimelineClip } from "../lib/db";

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
}

export function PreviewWindow({
  clips, features, setFeatures, videoDuration = 0, playheadSeconds = 0,
  onPlayheadChange, playheadDomRef, timecodeDomRef, pps = 80
}: PreviewWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<PlayerRef>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── RAF loop: pure DOM mutation, zero React state updates during playback ──
  useEffect(() => {
    // Pre-compute a formatter that mirrors Timeline's fmt() for the timecode display
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

        // 1. Move playhead line directly — no setState, no re-render
        if (playheadDomRef?.current) {
          playheadDomRef.current.style.left = `${sec * pps}px`;
        }

        // 2. Update timecode text directly — no setState, no re-render
        if (timecodeDomRef?.current) {
          timecodeDomRef.current.textContent = `${fmtTime(sec)} / ${fmtTime(videoDuration)}`;
        }

        // 3. Only sync React state when player STOPS (so ruler/toolbar stay correct)
        // This is handled by the Remotion Player's onPause callback below.
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playheadDomRef, timecodeDomRef, pps, videoDuration]);

  // ── Sync React state on pause only (via Remotion's event API) ──
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPause = () => {
      if (onPlayheadChange) {
        onPlayheadChange(player.getCurrentFrame() / 30);
      }
    };
    player.addEventListener('pause', onPause);
    return () => player.removeEventListener('pause', onPause);
  }, [onPlayheadChange]);

  // ── External seek (ruler click / drag): seek the player when paused ──
  useEffect(() => {
    if (!playerRef.current || videoDuration <= 0) return;
    if (playerRef.current.isPlaying()) return; // absolute guard: never interrupt active playback
    const frame = Math.round(playheadSeconds * 30);
    const current = playerRef.current.getCurrentFrame();
    if (Math.abs(current - frame) > 1) {
      playerRef.current.seekTo(frame);
    }
  }, [playheadSeconds, videoDuration]);

  // Convert local file paths to asset:// URLs for Remotion preview
  const previewClips = useMemo(() => clips.map(clip => ({
    ...clip,
    previewSrc: clip.file_path ? convertFileSrc(clip.file_path) : null,
  })), [clips]);

  const inputProps = useMemo(() => ({
    clips: previewClips,
    fontFamily: features?.fontFamily,
    animationStyle: features?.animationStyle,
    captionX: features?.captionX,
    captionY: features?.captionY,
  }), [previewClips, features]);

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
  const hasDenoise  = clips.some(c => c.ai_metadata?.['denoise']?.status === 'completed');

  return (
    <div className="preview-area">
      <div className="preview-bg-text">ALT·CUT</div>

      <div
        className={`preview-player-wrap ${isDragging ? 'dragging' : ''}`}
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {clips.length > 0 ? (
          <>
            <Player
              ref={playerRef}
              component={HormoziCaptions as any}
              inputProps={inputProps}
              durationInFrames={playerDuration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{ width: '240px', height: '427px' }}
              controls={!isDragging}
              autoPlay
              loop
            />

            {/* Caption drag handle */}
            {hasCaptions && (
              <div
                onMouseDown={handleHandleMouseDown}
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
                  cursor: 'move',
                  zIndex: 100,
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isDragging ? '0 0 15px rgba(255,204,0,0.4)' : 'none',
                  backgroundColor: 'rgba(255,204,0,0.02)',
                }}
              >
                {!isDragging && (
                  <div style={{
                    color: 'rgba(255,204,0,0.6)',
                    fontSize: '8px',
                    position: 'absolute',
                    top: '-15px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Drag to move text
                  </div>
                )}
              </div>
            )}

            <div className="preview-badges">
              <span className="preview-badge">1080×1920</span>
              <span className="preview-badge">30 FPS</span>
              {hasCaptions && (
                <span className="preview-badge" style={{ borderColor: '#ffcc00', color: '#ffcc00' }}>📝 CC</span>
              )}
              {hasDenoise && (
                <span className="preview-badge" style={{ borderColor: '#10b981', color: '#10b981' }}>🎧 Clean</span>
              )}
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <div className="preview-empty-icon">🎬</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>No clips yet</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Import a video from the media panel, then drag it into the timeline below.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
