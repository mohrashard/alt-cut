import { Player } from "@remotion/player";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HormoziCaptions } from "../remotion/HormoziCaptions";
import { AppFeatures } from "./PropertiesPanel";
import type { TimelineClip } from "../lib/db";

interface PreviewWindowProps {
  clips: TimelineClip[];
  features: AppFeatures | null;
  videoDuration?: number;
}

export function PreviewWindow({ clips, features, videoDuration = 0 }: PreviewWindowProps) {
  // Convert local file paths to asset:// URLs for Remotion preview
  const previewClips = clips.map(clip => ({
    ...clip,
    previewSrc: clip.file_path ? convertFileSrc(clip.file_path) : null,
  }));

  const playerDuration = Math.max(1, Math.round(videoDuration * 30));

  return (
    <div className="preview-area">
      <div className="preview-bg-text">ALT·CUT</div>

      <div className="preview-player-wrap">
        {clips.length > 0 ? (
          <>
            <Player
              component={HormoziCaptions as any}
              inputProps={{
                clips: previewClips,
                fontFamily: features?.fontFamily,
                animationStyle: features?.animationStyle,
              }}
              durationInFrames={playerDuration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{ width: '240px', height: '427px' }}
              controls
              autoPlay
              loop
            />
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
