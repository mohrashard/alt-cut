import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { ClipEffects } from '../lib/db';

interface EffectWrapperProps {
  clipId: number;
  effects: ClipEffects;
  children: React.ReactNode;
}

export const EffectWrapper: React.FC<EffectWrapperProps> = ({ clipId, effects, children }) => {
  const needsSharpen = effects.sharpen > 0;
  
  const filterString = [
    `brightness(${effects.brightness})`,
    `contrast(${effects.contrast})`,
    `saturate(${effects.saturation})`,
    `blur(${effects.blur}px)`,
    needsSharpen ? `url(#sharpen-${clipId})` : ''
  ].join(' ').trim();

  return (
    <>
      {needsSharpen && (
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <filter id={`sharpen-${clipId}`}>
              <feConvolveMatrix
                order="3"
                preserveAlpha="true"
                kernelMatrix={`
                  0 ${-effects.sharpen} 0
                  ${-effects.sharpen} ${1 + 4 * effects.sharpen} ${-effects.sharpen}
                  0 ${-effects.sharpen} 0
                `}
              />
            </filter>
          </defs>
        </svg>
      )}
      <AbsoluteFill style={{ filter: filterString }}>
        {children}
      </AbsoluteFill>
    </>
  );
};
