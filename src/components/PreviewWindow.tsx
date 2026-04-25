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
}

export function PreviewWindow({
  clips, features, setFeatures, videoDuration = 0, playheadSeconds = 0, onPlayheadChange
}: PreviewWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<PlayerRef>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastUpdateRef = useRef(playheadSeconds);

  // Sync Remotion frame -> Timeline playhead
  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (playerRef.current && playerRef.current.isPlaying() && onPlayheadChange) {
        const currentFrame = playerRef.current.getCurrentFrame();
        const sec = currentFrame / 30;
        // Throttle updates slightly to avoid choking React, or just update if diff is > 0
        if (Math.abs(sec - lastUpdateRef.current) > 0.02) {
          lastUpdateRef.current = sec;
          onPlayheadChange(sec);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onPlayheadChange]);

  // Sync Timeline playhead -> Remotion frame (external seeks)
  useEffect(() => {
    if (playerRef.current && videoDuration > 0) {
      const frame = Math.round(playheadSeconds * 30);
      const current = playerRef.current.getCurrentFrame();
      // Only seek if difference is large (meaning user clicked ruler) and player is NOT actively playing
      if (Math.abs(current - frame) > 1 && !playerRef.current.isPlaying()) {
        playerRef.current.seekTo(frame);
        lastUpdateRef.current = playheadSeconds;
      }
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
