import { AbsoluteFill, useCurrentFrame, useVideoConfig, Video, Series } from 'remotion';
import type { CaptionData } from '../types/captions';

const secondsToFrame = (t: number, fps: number) => Math.floor(t * fps);

interface Props {
  clips: any[];
  fontFamily?: string;
  animationStyle?: string;
}

export const HormoziCaptions: React.FC<Props> = ({
  clips = [],
  fontFamily = 'Arial',
  animationStyle = 'hormozi',
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {clips.length > 0 ? (
        <Series>
          {clips.map((clip) => {
            const clipDuration = clip.end_time - clip.start_time;
            const durationFrames = Math.max(1, secondsToFrame(clipDuration, fps));

            return (
              <Series.Sequence key={clip.id} durationInFrames={durationFrames}>
                <AbsoluteFill>
                  {/* Video layer */}
                  <Video
                    src={clip.previewSrc || clip.file_path}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    startFrom={secondsToFrame(clip.start_time, fps)}
                  />
                  {/* Caption layer — only when captions are ready */}
                  {clip.ai_metadata?.['captions']?.status === 'completed' && (
                    <ClipCaptions
                      clip={clip}
                      clipStartTime={clip.start_time}
                      fontFamily={fontFamily}
                      animationStyle={animationStyle}
                      fps={fps}
                    />
                  )}
                </AbsoluteFill>
              </Series.Sequence>
            );
          })}
        </Series>
      ) : (
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '24px', textAlign: 'center', padding: '40px' }}>
            Drag a clip to the timeline to preview it here
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ─── Per-clip captions overlay ────────────────────────────────
// useCurrentFrame() here gives frames relative to start of THIS Series.Sequence.
// Whisper timestamps are absolute seconds from video start.
// We subtract clipStartTime to align them.
const ClipCaptions: React.FC<{
  clip: any;
  clipStartTime: number;
  fontFamily: string;
  animationStyle: string;
  fps: number;
}> = ({ clip, clipStartTime, fontFamily, animationStyle, fps }) => {
  const frame = useCurrentFrame();

  let captionsData: CaptionData | null = null;
  try {
    const raw = clip.ai_metadata?.['captions']?.json_data;
    if (raw) captionsData = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!captionsData?.chunks?.length) return null;

  // Convert sequence-local frame → absolute video seconds
  const absoluteSeconds = clipStartTime + frame / fps;

  const currentChunk = captionsData.chunks.find(
    c => absoluteSeconds >= c.start && absoluteSeconds <= c.end
  );

  if (!currentChunk) return null;

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '12%',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '10px',
          width: '88%',
          fontFamily:
            fontFamily === 'Proxima Nova'
              ? '"Proxima Nova", "Arial", sans-serif'
              : `${fontFamily}, sans-serif`,
          fontSize: '68px',
          fontWeight: '900',
          textTransform: 'uppercase',
          textAlign: 'center',
          textShadow: '0 4px 14px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)',
          lineHeight: 1.1,
        }}
      >
        {currentChunk.words.map((wordObj, idx) => {
          const isActive =
            absoluteSeconds >= wordObj.start && absoluteSeconds <= wordObj.end;

          const activeColor = animationStyle === 'karaoke' ? '#39ff14' : '#FFD700';
          const activeTransform = animationStyle === 'karaoke'
            ? 'scale(1.12)'
            : 'scale(1.18) rotate(-2deg)';

          return (
            <span
              key={idx}
              style={{
                color:     isActive ? activeColor : 'white',
                transform: isActive ? activeTransform : 'scale(1)',
                transition: 'transform 0.08s ease-out, color 0.05s ease',
                display:   'inline-block',
                // Active word gets a subtle glow
                filter:    isActive ? `drop-shadow(0 0 12px ${activeColor})` : 'none',
              }}
            >
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};