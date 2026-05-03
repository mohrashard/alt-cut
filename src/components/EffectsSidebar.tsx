import React from 'react';
import type { ClipEffects } from '../lib/db';

export interface EffectsSidebarProps {
  selectedClipId: string | null;
  currentEffects: ClipEffects;
  onApply: (effects: ClipEffects) => void;
}

const PRESETS = [
  { id: 'normal', label: 'Normal', values: { brightness: 1, contrast: 1, saturation: 1, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #9ca3af, #4b5563)' },
  { id: 'vivid', label: 'Vivid', values: { brightness: 1.0, contrast: 1.1, saturation: 1.5, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #f43f5e, #8b5cf6)' },
  { id: 'matte', label: 'Matte', values: { brightness: 1.05, contrast: 0.85, saturation: 0.75, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #d1d5db, #9ca3af)' },
  { id: 'cinematic', label: 'Cinematic', values: { brightness: 0.9, contrast: 1.2, saturation: 0.8, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #0f172a, #0d9488)' },
  { id: 'cool', label: 'Cool', values: { brightness: 1.0, contrast: 1.05, saturation: 0.9, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  { id: 'warm', label: 'Warm', values: { brightness: 1.0, contrast: 1.05, saturation: 1.2, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
  { id: 'bw', label: 'B&W', values: { brightness: 1.0, contrast: 1.2, saturation: 0, blur: 0, sharpen: 0 }, background: 'linear-gradient(135deg, #1f2937, #f9fafb)' },
];

export const EffectsSidebar: React.FC<EffectsSidebarProps> = ({
  selectedClipId,
  currentEffects,
  onApply,
}) => {
  const handleSliderChange = (key: keyof ClipEffects, value: number) => {
    onApply({ ...currentEffects, [key]: value });
  };

  const isPresetActive = (presetValues: ClipEffects) => {
    return (
      currentEffects.brightness === presetValues.brightness &&
      currentEffects.contrast === presetValues.contrast &&
      currentEffects.saturation === presetValues.saturation
    );
  };

  return (
    <div className="effects-sidebar-container" style={{
      width: 'var(--sidebar-width, 260px)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--ac-bg-panel)',
      borderRight: '1px solid var(--ac-border)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--ac-border)',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--ac-text-primary)',
        flexShrink: 0
      }}>
        Effects
      </div>

      {!selectedClipId ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'var(--ac-text-muted)',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          Select a clip on the timeline first
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Section 1: Presets */}
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ac-text-secondary)', marginBottom: '12px', fontWeight: 600 }}>
              Presets
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}>
              {PRESETS.map((preset) => {
                const isActive = isPresetActive(preset.values);
                return (
                  <div
                    key={preset.id}
                    onClick={() => onApply({ ...currentEffects, ...preset.values })}
                    style={{
                      width: '100%',
                      background: 'var(--ac-bg-elevated)',
                      border: `1px solid ${isActive ? 'var(--ac-accent)' : 'var(--ac-border-subtle)'}`,
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s, transform 0.2s',
                    }}
                    className="effect-preset-card"
                  >
                    <div style={{
                      width: '100%',
                      aspectRatio: '16/9',
                      background: preset.background,
                    }} />
                    <div style={{
                      padding: '6px',
                      textAlign: 'center',
                      fontSize: '11px',
                      color: isActive ? 'var(--ac-accent-text)' : 'var(--ac-text-secondary)',
                      borderTop: `1px solid ${isActive ? 'var(--ac-accent)' : 'var(--ac-border-subtle)'}`,
                      background: isActive ? 'var(--ac-accent-dim)' : 'transparent',
                    }}>
                      {preset.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--ac-border-subtle)', margin: '0 16px' }} />

          {/* Section 2: Adjust */}
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ac-text-secondary)', marginBottom: '16px', fontWeight: 600 }}>
              Adjust
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="prop-slider-row">
                <div className="prop-slider-label">Brightness</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="2" step="0.1" value={currentEffects.brightness} onChange={e => handleSliderChange('brightness', parseFloat(e.target.value))} className="prop-range" />
                </div>
                <div className="prop-slider-value">{currentEffects.brightness.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Contrast</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="2" step="0.1" value={currentEffects.contrast} onChange={e => handleSliderChange('contrast', parseFloat(e.target.value))} className="prop-range" />
                </div>
                <div className="prop-slider-value">{currentEffects.contrast.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Saturation</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="2" step="0.1" value={currentEffects.saturation} onChange={e => handleSliderChange('saturation', parseFloat(e.target.value))} className="prop-range" />
                </div>
                <div className="prop-slider-value">{currentEffects.saturation.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Blur</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="20" step="1" value={currentEffects.blur} onChange={e => handleSliderChange('blur', parseInt(e.target.value, 10))} className="prop-range" />
                </div>
                <div className="prop-slider-value">{currentEffects.blur}px</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Sharpen</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="1" step="0.1" value={currentEffects.sharpen} onChange={e => handleSliderChange('sharpen', parseFloat(e.target.value))} className="prop-range" />
                </div>
                <div className="prop-slider-value">{currentEffects.sharpen.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .effect-preset-card:hover {
          border-color: var(--ac-accent) !important;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};
