import { Composition, getInputProps } from 'remotion';
import { HormoziCaptions } from './HormoziCaptions';

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps();
  const durationInFrames = (inputProps.durationInFrames as number) || 18000;

  return (
    <>
      <Composition
        id="CaptionsComp"
        component={HormoziCaptions as any}
        durationInFrames={durationInFrames}
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
