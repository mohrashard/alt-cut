import { AbsoluteFill, useCurrentFrame, useVideoConfig, Video, Audio, Sequence, spring } from 'remotion';

const secondsToFrame = (t: number, fps: number) => Math.floor(t * fps);

interface Props {
  clips: any[];
  fontFamily?: string;
  animationStyle?: string;
  captionX?: number;
  captionY?: number;
}

export const HormoziCaptions: React.FC<Props> = ({
  clips = [],
  fontFamily = 'Arial',
  animationStyle = 'hormozi',
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
          {videoClips.map((clip) => {
            const startFrame = secondsToFrame(clip.timeline_start, fps);
            const durationFrames = Math.max(1, secondsToFrame(clip.end_time - clip.start_time, fps));

            return (
              <Sequence key={`vid-${clip.id}`} from={startFrame} durationInFrames={durationFrames}>
                <AbsoluteFill>
                  <Video
                    src={clip.previewSrc || clip.file_path}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    startFrom={secondsToFrame(clip.start_time, fps)}
                    muted={clip.audio_enabled === 0}
                    volume={clip.audio_volume ?? 1.0}
                  />
                </AbsoluteFill>
              </Sequence>
            );
          })}

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
                  fontFamily={fontFamily}
                  animationStyle={animationStyle}
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
  fontFamily: string;
  animationStyle: string;
  captionX: number;
  captionY: number;
  fps: number;
}> = ({ clip, chunkData, fontFamily, animationStyle, captionX, captionY, fps }) => {
  const frame = useCurrentFrame();

  // Convert sequence-local frame -> absolute video seconds
  // This absolute seconds matches the original audio timing if it was un-shifted.
  // Wait, if the user moves the clip, what is the absolute time for highlighting?
  // We want the karaoke effect to progress from clip.start_time to clip.end_time!
  // frame / fps gives us seconds since the start of the SEQUENCE.
  // So sequence local time is (frame / fps).
  // The original chunk has its own start/end. We want to map sequence local time [0, duration]
  // to the original chunk time [chunk.start, chunk.end] but shifted by clip.start_time.

  const sequenceLocalSeconds = frame / fps;
  // The time within the asset's original file is clip.start_time + sequenceLocalSeconds.
  // Whisper timestamps in chunkData.words are relative to the original video asset.
  // Because the "asset" for a TextClip is the chunk itself, we must add chunkData.start.
  const chunkStart = chunkData.start || 0;
  const assetSeconds = chunkStart + clip.start_time + sequenceLocalSeconds;

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
          fontFamily:
            fontFamily === 'Proxima Nova'
              ? '"Proxima Nova", "Arial", sans-serif'
              : `${fontFamily}, sans-serif`,
          fontSize: '76px',
          fontWeight: '900',
          textTransform: 'uppercase',
          textAlign: 'center',
          // Classic thick black outline and shadow
          textShadow: `
            4px 4px 0 #000, 
            -4px -4px 0 #000, 
            4px -4px 0 #000, 
            -4px 4px 0 #000,
            0px 6px 0px #000,
            0px 12px 20px rgba(0,0,0,0.8)
          `,
          WebkitTextStroke: '2px black',
          lineHeight: 1.15,
        }}
      >
        {chunkData.words && chunkData.words.length > 0 ? (
          chunkData.words.map((wordObj: any, idx: number) => {
            const isActive =
              assetSeconds >= wordObj.start && assetSeconds <= wordObj.end;

            // Compute frame progress relative to this word's start time
            const wordActiveFrames = (assetSeconds - wordObj.start) * fps;
            
            let scale = 1;
            let rotate = 0;

            if (isActive) {
              if (animationStyle === 'hormozi') {
                // Spring animation for aggressive pop
                const pop = spring({
                  fps,
                  frame: wordActiveFrames,
                  config: { damping: 10, mass: 0.5, stiffness: 200 },
                });
                scale = 1 + (pop * 0.25); // Scale up to 1.25x
                rotate = pop * -4;        // Rotate slightly left
              } else {
                scale = 1.15;
              }
            }

            const activeColor = animationStyle === 'karaoke' ? '#39ff14' : '#FFDE59'; // Bright Hormozi Yellow

            return (
              <span
                key={idx}
                style={{
                  color:     isActive ? activeColor : 'white',
                  transform: `scale(${scale}) rotate(${rotate}deg)`,
                  display:   'inline-block',
                  // Only apply transitions for karaoke; hormozi is driven frame-by-frame by the spring
                  transition: animationStyle === 'karaoke' ? 'transform 0.08s ease-out, color 0.05s ease' : 'none',
                  filter:    isActive ? `drop-shadow(0 0 16px ${activeColor})` : 'none',
                  zIndex:    isActive ? 10 : 1,
                  position:  'relative',
                }}
              >
                {wordObj.word}
              </span>
            );
          })
        ) : (
          <span style={{ color: 'white' }}>{chunkData.text}</span>
        )}
      </div>
    </AbsoluteFill>
  );
};