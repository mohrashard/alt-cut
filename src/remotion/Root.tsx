import { Composition } from 'remotion';
import { HormoziCaptions } from './HormoziCaptions';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CaptionsComp"
        component={HormoziCaptions as any}
        durationInFrames={18000} // 10 minutes max for now
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [],
          fontFamily: 'Arial',
          animationStyle: 'hormozi',
          captions: null,
        }}
      />
    </>
  );
};
