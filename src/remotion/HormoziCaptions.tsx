import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Video, Audio, Sequence, spring } from 'remotion';
import { EffectWrapper } from './EffectWrapper';
import { TransitionHandler } from './TransitionHandler';
import type { ClipEffects, CaptionStyle, Transition } from '../lib/db';
import { parseCaptionStyle } from '../lib/captionPresets';

const DEFAULT_EFFECTS: ClipEffects = {
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  blur: 0,
  sharpen: 0,
};

const secondsToFrame = (t: number, fps: number) => Math.floor(t * fps);

const hexToRgba = (hex: string, opacity: number) => {
  const c = hex.replace('#', '');
  if (c.length === 3) {
    return `rgba(${parseInt(c[0] + c[0], 16)}, ${parseInt(c[1] + c[1], 16)}, ${parseInt(c[2] + c[2], 16)}, ${opacity})`;
  }
  if (c.length === 6) {
    return `rgba(${parseInt(c.slice(0, 2), 16)}, ${parseInt(c.slice(2, 4), 16)}, ${parseInt(c.slice(4, 6), 16)}, ${opacity})`;
  }
  return hex;
};

interface Props {
  clips: any[];
  transitions?: Transition[];
  captionX?: number;
  captionY?: number;
}

export const HormoziCaptions: React.FC<Props> = ({
  clips = [],
  transitions = [],
  captionX = 0,
  captionY = 80,
}) => {
  const { fps } = useVideoConfig();

  const videoClips = clips.filter(c => !c.track_type || c.track_type === 'video');
  const audioClips = clips.filter(c => c.track_type === 'audio');
  const textClips = clips.filter(c => c.track_type === 'text');

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {videoClips.length > 0 ? (
        <AbsoluteFill>
          {/* Video tracks */}
          {(() => {
            const elements = [];
            for (let i = 0; i < videoClips.length; i++) {
              const clip = videoClips[i];
              const prevClip = videoClips[i - 1];
              const nextClip = videoClips[i + 1];

              const transIn = prevClip ? transitions?.find(t => t.clip_a_id === prevClip.id && t.clip_b_id === clip.id) : null;
              const transOut = nextClip ? transitions?.find(t => t.clip_a_id === clip.id && t.clip_b_id === nextClip.id) : null;

              let parsedEffects = DEFAULT_EFFECTS;
              if (clip.effects) {
                try { parsedEffects = { ...DEFAULT_EFFECTS, ...JSON.parse(clip.effects) }; } catch (e) {}
              }

              const clipDurSec = clip.end_time - clip.start_time;
              const transInSec = transIn ? transIn.duration_frames / fps : 0;
              const transOutSec = transOut ? transOut.duration_frames / fps : 0;

              // Render the solo part of the clip
              const soloStartSec = clip.timeline_start + transInSec;
              const soloDurSec = clipDurSec - transInSec - transOutSec;
              if (soloDurSec > 0) {
                elements.push(
                  <Sequence key={`vid-solo-${clip.id}`} from={secondsToFrame(soloStartSec, fps)} durationInFrames={Math.max(1, secondsToFrame(soloDurSec, fps))}>
                    <EffectWrapper clipId={clip.id} effects={parsedEffects}>
                      <Video
                        src={clip.previewSrc || clip.file_path}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        startFrom={secondsToFrame(clip.start_time + transInSec, fps)}
                        muted={clip.audio_enabled === 0}
                        volume={clip.audio_volume ?? 1.0}
                      />
                    </EffectWrapper>
                  </Sequence>
                );
              }

              // Render the transition TO the next clip
              if (transOut && nextClip) {
                const transStartFrame = secondsToFrame(clip.timeline_start + clipDurSec - transOutSec, fps);
                elements.push(
                  <Sequence key={`trans-${clip.id}-${nextClip.id}`} from={transStartFrame} durationInFrames={transOut.duration_frames}>
                    <TransitionHandler clipA={clip} clipB={nextClip} transition={transOut} durationFrames={transOut.duration_frames} />
                  </Sequence>
                );
              }
            }
            return elements;
          })()}

          {/* Audio tracks */}
          {audioClips.map((clip) => {
            const startFrame = secondsToFrame(clip.timeline_start, fps);
            const durationFrames = Math.max(1, secondsToFrame(clip.end_time - clip.start_time, fps));
            return (
              <Sequence key={`aud-${clip.id}`} from={startFrame} durationInFrames={durationFrames}>
                <Audio
                  src={clip.previewSrc || clip.file_path}
                  startFrom={secondsToFrame(clip.start_time, fps)}
                  volume={clip.audio_enabled === 0 ? 0 : (clip.audio_volume ?? 1.0)}
                />
              </Sequence>
            );

          })}

          {/* Text/Caption tracks laid on top */}
          {textClips.map(clip => {
            const startFrame = secondsToFrame(clip.timeline_start, fps);
            const durationFrames = Math.max(1, secondsToFrame(clip.end_time - clip.start_time, fps));

            // Parse chunk JSON from text:// asset
            let chunkData = null;
            if (clip.file_path?.startsWith('text://')) {
              try {
                chunkData = JSON.parse(clip.file_path.substring(7));
              } catch {
                // If it's just raw text, not JSON
                chunkData = { text: clip.file_path.substring(7), words: [] };
              }
            }

            if (!chunkData) return null;

            return (
              <Sequence 
                key={`txt-${clip.id}`}
                from={startFrame}
                durationInFrames={durationFrames}
                layout="absolute-fill"
              >
                <TextClip
                  clip={clip}
                  chunkData={chunkData}
                  captionX={captionX}
                  captionY={captionY}
                  fps={fps}
                />
              </Sequence>
            );
          })}
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '24px', textAlign: 'center', padding: '40px' }}>
            Drag a video clip to the timeline to preview it here
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ─── Individual Text/Caption Clip Overlay ─────────────────────
const TextClip: React.FC<{
  clip: any;
  chunkData: any;
  captionX: number;
  captionY: number;
  fps: number;
}> = ({ clip, chunkData, captionX, captionY, fps }) => {
  const frame = useCurrentFrame();

  // ── Resolve captionStyle from the clip's DB field, fall back to hormozi preset ──
  const captionStyle: CaptionStyle = useMemo(() => {
    return parseCaptionStyle(
      typeof clip.caption_style === 'string' ? clip.caption_style : null
    );
  }, [clip.caption_style]);

  // Convert sequence-local frame -> absolute video seconds
  // This absolute seconds matches the original audio timing if it was un-shifted.
  // Wait, if the user moves the clip, what is the absolute time for highlighting?
  // We want the karaoke effect to progress from clip.start_time to clip.end_time!
  // frame / fps gives us seconds since the start of the SEQUENCE.
  // So sequence local time is (frame / fps).
  // The original chunk has its own start/end. We want to map sequence local time [0, duration]
  // to the original chunk time [chunk.start, chunk.end] but shifted by clip.start_time.

  const sequenceLocalSeconds = frame / fps;
  // assetSeconds maps the current frame (relative to timeline_start) back to the original asset's time domain.
  const assetSeconds = clip.start_time + sequenceLocalSeconds;

  // ── Build derived style values from captionStyle ───────────────────────────
  const resolvedFontFamily =
    captionStyle.fontFamily === 'Proxima Nova'
      ? '"Proxima Nova", "Arial", sans-serif'
      : `${captionStyle.fontFamily}, sans-serif`;

  // Stroke
  const webkitTextStroke =
    captionStyle.strokeWidth > 0
      ? `${captionStyle.strokeWidth}px ${captionStyle.strokeColor}`
      : 'none';

  const buildTextShadow = () => {
    const shadows: string[] = [];

    if (captionStyle.glowSize > 0) {
      shadows.push(`0 0 ${captionStyle.glowSize}px ${captionStyle.glowColor}`);
    }

    if (captionStyle.strokeWidth === 0) {
      shadows.push(
        `4px 4px 0 ${captionStyle.strokeColor}`,
        `-4px -4px 0 ${captionStyle.strokeColor}`,
        `4px -4px 0 ${captionStyle.strokeColor}`,
        `-4px 4px 0 ${captionStyle.strokeColor}`,
        `0px 6px 0px ${captionStyle.strokeColor}`
      );
    }
    // If strokeWidth > 0, we omit the faux-stroke shadow entirely because 
    // WebkitTextStroke handles the outline. This prevents a blurry double-stroke.

    // Always append the drop shadow for depth
    shadows.push(`0px 12px 20px rgba(0,0,0,0.8)`);

    return shadows.join(', ');
  };

  const renderedWords = useMemo(() => {
    if (!chunkData.words || chunkData.words.length === 0) return null;

    return chunkData.words.map((wordObj: any, idx: number) => {
      const isActive =
        assetSeconds >= wordObj.start && assetSeconds <= wordObj.end;

      // Compute frame progress relative to this word's start time
      const wordActiveFrames = (assetSeconds - wordObj.start) * fps;
      
      let scale = 1;
      let rotate = 0;
      let opacity = 1;

      if (isActive && captionStyle.animation === 'pop') {
        // Spring animation for aggressive pop — timing unchanged
        const pop = spring({
          fps,
          frame: wordActiveFrames,
          config: { damping: 10, mass: 0.5, stiffness: 200 },
        });
        scale = 1 + (pop * 0.25); // Scale up to 1.25x
        rotate = pop * -4;        // Rotate slightly left
      } else if (captionStyle.animation === 'fade') {
        opacity = isActive ? 1 : 0.5;
      } else if (captionStyle.animation === 'none') {
        // No transforms
      } else if (isActive) {
        scale = 1.15;
      }

      // Active (highlighted) word colour comes from captionStyle
      const activeColor = captionStyle.highlightColor;
      // Inactive word colour comes from captionStyle.color
      const inactiveColor = captionStyle.color;

      // Per-word glow on the active word (uses captionStyle.glowSize / glowColor)
      const wordFilter =
        isActive && captionStyle.glowSize > 0
          ? `drop-shadow(0 0 ${captionStyle.glowSize}px ${captionStyle.glowColor})`
          : 'none';

      return (
        <span
          key={wordObj.start ?? idx}
          style={{
            color:      isActive ? activeColor : inactiveColor,
            background: isActive ? hexToRgba(captionStyle.bgColor, captionStyle.bgOpacity) : 'transparent',
            transform: `scale(${scale}) rotate(${rotate}deg)`,
            display:   'inline-block',
            // Only apply CSS transitions for karaoke; hormozi is driven frame-by-frame
            transition: captionStyle.animation === 'fade' ? 'opacity 0.2s ease, color 0.05s ease' : 'none',
            filter:    wordFilter,
            zIndex:    isActive ? 10 : 1,
            position:  'relative',
            opacity,
          }}
        >
          {wordObj.word}
        </span>
      );
    });
  }, [chunkData.words, captionStyle, frame, assetSeconds, fps]);

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        left: `${50 + captionX}%`,
        top: `${captionY}%`,
        width: '100%',
        height: 'auto',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '12px',
          width: '90%',
          fontFamily: resolvedFontFamily,
          fontSize: `${captionStyle.fontSize}px`,
          fontWeight: captionStyle.bold ? 700 : 400,
          fontStyle: captionStyle.italic ? 'italic' : 'normal',
          textTransform: captionStyle.uppercase ? 'uppercase' : 'none',
          textAlign: 'center',
          textShadow: buildTextShadow(),
          WebkitTextStroke: webkitTextStroke,
          lineHeight: 1.15,
        }}
      >
        {renderedWords ? (
          renderedWords
        ) : (
          <span style={{ color: captionStyle.color }}>{chunkData.text}</span>
        )}
      </div>
    </AbsoluteFill>
  );
};