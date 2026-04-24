import { useRef, useState } from "react";
import { Player } from "@remotion/player";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HormoziCaptions } from "../remotion/HormoziCaptions";
import { AppFeatures } from "./PropertiesPanel";
import type { TimelineClip } from "../lib/db";

interface PreviewWindowProps {
  clips: TimelineClip[];
  features: AppFeatures | null;
  setFeatures: (f: AppFeatures) => void;
  videoDuration?: number;
}

export function PreviewWindow({ clips, features, setFeatures, videoDuration = 0 }: PreviewWindowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert local file paths to asset:// URLs for Remotion preview
  const previewClips = clips.map(clip => ({
    ...clip,
    previewSrc: clip.file_path ? convertFileSrc(clip.file_path) : null,
  }));

  const playerDuration = Math.max(1, Math.round(videoDuration * 30));

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging if captions exist
    const hasCaptions = clips.some(c => c.ai_metadata?.['captions']?.status === 'completed');
    if (hasCaptions) {
      setIsDragging(true);
      updatePosition(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      updatePosition(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updatePosition = (e: React.MouseEvent) => {
    if (!containerRef.current || !features) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Relative position (0 to 1)
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    // Convert to our feature scale
    // captionX: -50 to 50 (offset from center)
    // captionY: 0 to 100 (from top)
    const newX = Math.round((relX - 0.5) * 100);
    const newY = Math.round(relY * 100);

    setFeatures({
      ...features,
      captionX: Math.max(-50, Math.min(50, newX)),
      captionY: Math.max(0, Math.min(100, newY)),
    });
  };

  return (
    <div className="preview-area">
      <div className="preview-bg-text">ALT·CUT</div>

      <div 
        className={`preview-player-wrap ${isDragging ? 'dragging' : ''}`}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: clips.some(c => c.ai_metadata?.['captions']?.status === 'completed') ? 'move' : 'default' }}
      >
        {clips.length > 0 ? (
          <>
            <Player
              component={HormoziCaptions as any}
              inputProps={{
                clips: previewClips,
                fontFamily: features?.fontFamily,
                animationStyle: features?.animationStyle,
                captionX: features?.captionX,
                captionY: features?.captionY,
              }}
              durationInFrames={playerDuration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{ 
                width: '240px', 
                height: '427px', 
                pointerEvents: isDragging ? 'none' : 'auto' // Allow dragging through the player
              }}
              controls={!isDragging} // Hide controls while dragging for better UX
              autoPlay
              loop
            />
            
            {/* Visual feedback box while dragging */}
            {isDragging && (
              <div style={{
                position: 'absolute',
                top: `${features?.captionY}%`,
                left: `${50 + (features?.captionX || 0)}%`,
                width: '80%',
                height: '60px',
                border: '2px solid #ffcc00',
                borderRadius: '4px',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                boxShadow: '0 0 15px rgba(255,204,0,0.4)',
                zIndex: 10
              }} />
            )}

            <div className="preview-badges">
              <span className="preview-badge">1080×1920</span>
              <span className="preview-badge">30 FPS</span>
              {clips.some(c => c.ai_metadata?.['captions']?.status === 'completed') && (
                <span className="preview-badge" style={{ borderColor: '#ffcc00', color: '#ffcc00' }}>📝 CC</span>
              )}
              {clips.some(c => c.ai_metadata?.['denoise']?.status === 'completed') && (
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
