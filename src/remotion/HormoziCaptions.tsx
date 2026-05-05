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
  onTimelineChange?: () => void;
  styleOverrides?: { clipId: number | string; style: any } | null;
}

export function HormoziCaptions({
  clips = [],
  transitions = [],
  captionX = 0,
  captionY = 80,
  styleOverrides,
}: Props) {
  const { fps } = useVideoConfig();

  const safeClips = Array.isArray(clips) ? clips : [];
  const videoClips = safeClips.filter(c => !c.track_type || c.track_type === 'video');
  const audioClips = safeClips.filter(c => c.track_type === 'audio');
  const textClips = safeClips.filter(c => c.track_type === 'text');
  // BUG FIX: Include caption_style in the key so style changes trigger a re-memoization
  const textClipsKey = textClips.map(c => `${c.id}-${c.file_path}-${c.caption_style || ''}`).join(',');

  const parsedTextClips = useMemo(() => {
    return textClips.map(clip => {
      let chunkData = null;
      if (clip.file_path?.startsWith('text://')) {
        try {
          chunkData = JSON.parse(clip.file_path.substring(7));
        } catch {
          chunkData = { text: clip.file_path.substring(7), words: [] };
        }
      }
      return { ...clip, chunkData };
    });
  }, [textClipsKey]);

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
                try { parsedEffects = { ...DEFAULT_EFFECTS, ...JSON.parse(clip.effects) }; } catch (e) { }
              }

              const clipDurSec = clip.end_time - clip.start_time;
              const transInSec = transIn ? transIn.duration_frames / fps : 0;
              const transOutSec = transOut ? transOut.duration_frames / fps : 0;

              const soloStartSec = clip.timeline_start + transInSec;
              const soloDurSec = Math.max(0, clipDurSec - transInSec - transOutSec);
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
                        // ⚠️ CRITICAL: Must be >= 120s to prevent Remotion from triggering forced seeks 
                        // during minor Tauri/browser buffering micro-stalls (prevents audio stutter).
                        acceptableTimeShiftInSeconds={120}
                      />
                    </EffectWrapper>
                  </Sequence>
                );
              }

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
                  // ⚠️ CRITICAL: Prevent forced seeks during micro-stalls (audio stutter fix).
                  acceptableTimeShiftInSeconds={120}
                />
              </Sequence>
            );
          })}

          {/* Text/Caption tracks */}
          {(() => {
            const lanes = new Map<number, any[]>();
            parsedTextClips.forEach(c => {
              const lane = c.track_lane ?? 0;
              if (!lanes.has(lane)) lanes.set(lane, []);
              lanes.get(lane)!.push(c);
            });

            return Array.from(lanes.entries()).map(([lane, clipsInLane]) => (
              <AbsoluteFill key={`txt-lane-${lane}`} style={{ zIndex: lane * 10 }}>
                {clipsInLane.map(clip => {
                  const startFrame = secondsToFrame(clip.timeline_start, fps);
                  const durationFrames = Math.max(1, secondsToFrame(clip.end_time - clip.start_time, fps));

                  if (!clip.chunkData) return null;

                  return (
                    <Sequence
                      key={`txt-${clip.id}`}
                      from={startFrame}
                      durationInFrames={durationFrames}
                    >
                      <TextClip
                        clip={clip}
                        chunkData={clip.chunkData}
                        fps={fps}
                        globalCaptionX={captionX}
                        globalCaptionY={captionY}
                        styleOverrides={styleOverrides}
                      />
                    </Sequence>
                  );
                })}
              </AbsoluteFill>
            ));
          })()}
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
}

// ─── Individual Text/Caption Clip Overlay ─────────────────────
const TextClip: React.FC<{
  clip: any;
  chunkData: any;
  fps: number;
  globalCaptionX?: number;
  globalCaptionY?: number;
  styleOverrides?: { clipId: number | string; style: any } | null;
}> = ({ clip, chunkData, fps, globalCaptionX = 0, globalCaptionY = 0, styleOverrides }) => {
  const frame = useCurrentFrame();

  const captionStyle: CaptionStyle = useMemo(() => {
    const base = parseCaptionStyle(
      typeof clip.caption_style === 'string' ? clip.caption_style : null
    );
    if (styleOverrides && styleOverrides.clipId === clip.id) {
      return { ...base, ...styleOverrides.style };
    }
    return base;
  }, [clip.caption_style, styleOverrides, clip.id]);

  const effectiveX = (captionStyle.x ?? 0) + globalCaptionX;
  const effectiveY = (captionStyle.y ?? 0) + (globalCaptionY - 80);

  const sequenceLocalSeconds = frame / fps;
  const clipLocalStart = clip.start_time ?? 0;
  const chunkAbsoluteStart = chunkData.start ?? clipLocalStart;
  const assetSeconds = chunkAbsoluteStart + sequenceLocalSeconds;

  const resolvedFontFamily = `"${captionStyle.fontFamily}", "Inter", "Segoe UI", Roboto, Arial, sans-serif`;

  const webkitTextStroke =
    captionStyle.strokeWidth > 0
      ? `${captionStyle.strokeWidth}px ${captionStyle.strokeColor}`
      : 'none';

  const buildTextShadow = () => {
    const shadows: string[] = [];
    if (captionStyle.glowSize > 0) {
      shadows.push(`0 0 ${captionStyle.glowSize}px ${captionStyle.glowColor}`);
      shadows.push(`0 0 ${captionStyle.glowSize * 2}px ${captionStyle.glowColor}`);
      shadows.push(`0 0 ${captionStyle.glowSize * 3}px ${captionStyle.glowColor}`);
    }
    if (captionStyle.shadowX !== 0 || captionStyle.shadowY !== 0 || captionStyle.shadowBlur > 0) {
      shadows.push(
        `${captionStyle.shadowX}px ${captionStyle.shadowY}px ${captionStyle.shadowBlur}px rgba(0,0,0,0.9)`
      );
    } else if (captionStyle.glowSize === 0) {
      shadows.push(`0px 4px 12px rgba(0,0,0,0.8)`);
    }
    return shadows.length > 0 ? shadows.join(', ') : 'none';
  };

  const words: any[] = useMemo(() => {
    if (chunkData.words && chunkData.words.length > 0) return chunkData.words;
    const text = chunkData.text || '';
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const clipDuration = Math.max(0.01, clip.end_time - clip.start_time);
    const perWord = clipDuration / Math.max(tokens.length, 1);
    return tokens.map((w: string, i: number) => ({
      word: w,
      start: clip.start_time + i * perWord,
      end: clip.start_time + (i + 1) * perWord,
    }));
  }, [chunkData.words, chunkData.text, clip.start_time, clip.end_time]);

  const renderedWords = useMemo(() => {
    return words.map((wordObj: any, idx: number) => {
      const wordRelativeStart = wordObj.start - chunkAbsoluteStart;
      const wordRelativeEnd = wordObj.end - chunkAbsoluteStart;
      const isActive = sequenceLocalSeconds >= wordRelativeStart && sequenceLocalSeconds < wordRelativeEnd;
      const wordActiveFrames = Math.max(0, (assetSeconds - wordObj.start) * fps);
      const wordDuration = Math.max(0.01, wordObj.end - wordObj.start);

      let scale = 1;
      let rotate = 0;
      let opacity = 1;
      let translateY = 0;

      if (isActive) {
        if (captionStyle.animation === 'pop') {
          if (captionStyle.animEasing === 'spring') {
            const pop = spring({
              fps,
              frame: wordActiveFrames,
              config: { damping: 10, stiffness: 200 },
            });
            scale = 1 + pop * 0.25;
            rotate = pop * -4;
          } else {
            scale = 1.25;
            rotate = -4;
          }
        } else if (captionStyle.animation === 'bounce') {
          const t = wordActiveFrames / Math.max(1, wordDuration * fps);
          translateY = Math.sin(t * Math.PI * 2) * -8;
          scale = 1.1;
        } else if (captionStyle.animation === 'shake') {
          scale = 1.1;
          rotate = Math.sin(wordActiveFrames * 0.8) * 6;
        } else if (captionStyle.animation === 'zoom') {
          const pop = spring({ fps, frame: wordActiveFrames, config: { damping: 8, stiffness: 300 } });
          scale = 1 + pop * 0.4;
          opacity = Math.min(1, 0.5 + pop * 0.5);
        } else if (captionStyle.animation === 'typewriter') {
          scale = 1.05;
        }
      }

      if (captionStyle.animation === 'fade') {
        opacity = isActive ? 1 : 0.35;
      }

      const clipDuration = Math.max(0.01, clip.end_time - clip.start_time);
      const clipProgress = sequenceLocalSeconds / clipDuration;
      let fadeMultiplier = 1;
      if (captionStyle.fadeInDuration > 0 && clipProgress < captionStyle.fadeInDuration) {
        fadeMultiplier = clipProgress / captionStyle.fadeInDuration;
      } else if (captionStyle.fadeOutDuration > 0 && clipProgress > 1 - captionStyle.fadeOutDuration) {
        fadeMultiplier = (1 - clipProgress) / captionStyle.fadeOutDuration;
      }
      opacity *= Math.max(0, Math.min(1, fadeMultiplier));

      const activeColor = captionStyle.highlightColor;
      const inactiveColor = captionStyle.color;

      const isKaraokeFill = captionStyle.karaokeFill && isActive;
      const fillPct = isKaraokeFill
        ? Math.max(0, Math.min(100, (wordActiveFrames / (wordDuration * fps)) * 100))
        : 0;

      return (
        <span
          key={`word-${wordObj.start ?? idx}-${idx}`}
          style={{
            color: isKaraokeFill ? inactiveColor : (isActive ? activeColor : inactiveColor),
            background: isActive && captionStyle.bgOpacity > 0
              ? hexToRgba(captionStyle.bgColor, captionStyle.bgOpacity)
              : 'transparent',
            transform: `scale(${scale}) rotate(${rotate}deg) translateY(${translateY}px)`,
            display: 'inline-block',
            transition: captionStyle.animEasing !== 'spring'
              ? `all ${captionStyle.animDuration}s ${captionStyle.animEasing}`
              : 'none',
            zIndex: isActive ? 10 : 1,
            position: 'relative',
            opacity,
            letterSpacing: `${captionStyle.letterSpacing}px`,
            padding: '0 4px',
            borderRadius: '4px',
            willChange: 'transform, opacity',
          }}
        >
          {isKaraokeFill ? (
            <>
              {wordObj.word}
              <span style={{
                position: 'absolute', left: 0, top: 0,
                color: activeColor,
                width: `${fillPct}%`,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                willChange: 'width',
              }}>{wordObj.word}</span>
            </>
          ) : wordObj.word}
        </span>
      );
    });
  }, [words, captionStyle, frame, assetSeconds, fps, clip.id, sequenceLocalSeconds]);

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        pointerEvents: 'auto',
      }}
    >
      {/* 1. MASTER POSITIONING CONTAINER */}
      <div
        style={{
          position: 'absolute',
          top: `${effectiveY}%`,
          left: `${50 + effectiveX}%`,
          // FIX A: Lock transform to ALWAYS perfectly center on the dashed drag box
          transform: 'translate(-50%, -50%)',
          // FIX B: Match the PreviewWindow bounding box exact width
          width: 'max-content',
          maxWidth: '85%',
          // FIX C: Force the inner background box to align based on user's textAlign choice
          display: 'flex',
          flexDirection: 'column',
          alignItems: captionStyle.textAlign === 'left' ? 'flex-start'
            : captionStyle.textAlign === 'right' ? 'flex-end'
              : 'center',
        }}
      >
        {/* 2. BACKGROUND & PADDING LAYER */}
        <div
          style={{
            background: captionStyle.lineBgEnabled
              ? hexToRgba(captionStyle.bgColor, captionStyle.bgOpacity > 0 ? captionStyle.bgOpacity : 0.85)
              : 'transparent',
            borderRadius: 8,
            padding: captionStyle.lineBgEnabled ? `${captionStyle.lineBgPadding}px` : 0,
            maxWidth: '100%',
          }}
        >
          {/* 3. TEXT LAYOUT LAYER */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: captionStyle.textAlign === 'left' ? 'flex-start'
                : captionStyle.textAlign === 'right' ? 'flex-end'
                  : 'center',
              gap: '8px',
              width: '100%',
              fontFamily: resolvedFontFamily,
              fontSize: `${captionStyle.fontSize}px`,
              fontWeight: captionStyle.bold ? 700 : 400,
              fontStyle: captionStyle.italic ? 'italic' : 'normal',
              textTransform: captionStyle.uppercase ? 'uppercase' : 'none',
              textAlign: captionStyle.textAlign,
              textShadow: buildTextShadow(),
              WebkitTextStroke: webkitTextStroke,
              lineHeight: captionStyle.lineHeight,
            }}
          >
            {renderedWords}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};