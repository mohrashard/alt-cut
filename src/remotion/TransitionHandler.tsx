import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Video } from 'remotion';
import type { TimelineClip, Transition } from '../lib/db';

interface TransitionHandlerProps {
  clipA: TimelineClip;
  clipB: TimelineClip;
  transition: Transition;
  durationFrames: number;
}

const secondsToFrame = (t: number, fps: number) => Math.floor(t * fps);

export const TransitionHandler: React.FC<TransitionHandlerProps> = ({
  clipA,
  clipB,
  transition,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Progress from 0 to 1 over the duration of the transition
  const progress = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const clipBStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  
  const clipAStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  switch (transition.type) {
    case 'wipe':
      const insetRight = interpolate(progress, [0, 1], [100, 0]);
      clipBStyle.clipPath = `inset(0 ${insetRight}% 0 0)`;
      break;
    case 'shutter':
      clipBStyle.transform = `scaleX(${progress})`;
      clipBStyle.transformOrigin = 'center';
      break;
    case 'ink':
      // Fallback cross-dissolve until luma matte
      clipBStyle.opacity = progress;
      clipAStyle.opacity = 1 - progress;
      break;
  }

  // Calculate the start time within the asset for the overlap period
  // clipA shows its final frames during the transition
  const clipADurationSec = clipA.end_time - clipA.start_time;
  const transitionSec = durationFrames / fps;
  const clipAStartSec = clipA.start_time + Math.max(0, clipADurationSec - transitionSec);
  
  // clipB shows its initial frames during the transition
  const clipBStartSec = clipB.start_time;

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        {clipA.file_path && (
          <Video
            src={(clipA as any).previewSrc || clipA.file_path}
            style={clipAStyle}
            startFrom={secondsToFrame(clipAStartSec, fps)}
            muted={clipA.audio_enabled === 0}
            volume={clipA.audio_volume ?? 1.0}
          />
        )}
      </AbsoluteFill>
      <AbsoluteFill>
        {clipB.file_path && (
          <Video
            src={(clipB as any).previewSrc || clipB.file_path}
            style={clipBStyle}
            startFrom={secondsToFrame(clipBStartSec, fps)}
            muted={clipB.audio_enabled === 0}
            volume={clipB.audio_volume ?? 1.0}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
