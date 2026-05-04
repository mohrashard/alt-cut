import React, { useState, useEffect } from 'react';
import type { CaptionStyle } from '../lib/db';
import * as db from '../lib/db';
import { CAPTION_PRESETS, getPreset } from '../lib/captionPresets';

// ─── Types ────────────────────────────────────────────────────

interface Props {
  clipId: string;
  currentStyle: CaptionStyle;
  onChange: (style: CaptionStyle) => void;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Patch a single key and bubble up. */
function patch<K extends keyof CaptionStyle>(
  current: CaptionStyle,
  key: K,
  value: CaptionStyle[K],
  onChange: (s: CaptionStyle) => void
) {
  onChange({ ...current, [key]: value });
}

function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/i.test(color);
}

// Readable labels for the animation chip buttons
const ANIMATION_OPTIONS: { value: CaptionStyle['animation']; label: string }[] = [
  { value: 'pop',  label: 'Pop'  },
  { value: 'fade', label: 'Fade' },
  { value: 'none', label: 'None' },
];

// Available font families
const FONT_OPTIONS = [
  'Arial',
  'Impact',
  'Montserrat',
  'Oswald',
  'Bebas Neue',
  'Proxima Nova',
  'Roboto',
  'Poppins',
  'Raleway',
  'Ubuntu',
  'Lato',
  'Open Sans',
  'Nunito',
  'Pacifico',
  'Righteous',
  'Anton',
  'Bangers',
  'Russo One',
  'Teko',
  'Barlow Condensed',
];

// Human-readable preset display labels
const PRESET_LABELS: Record<string, string> = {
  hormozi: 'Hormozi',
  neon:    'Neon',
  minimal: 'Minimal',
  karaoke: 'Karaoke',
};

// ─── Sub-components ───────────────────────────────────────────

/** Mini card for each preset. */
function PresetCard({
  preset,
  isActive,
  onClick,
}: {
  preset: CaptionStyle;
  isActive: boolean;
  onClick: () => void;
}) {
  // Build a rough inline preview style from the preset's colours
  const previewStyle: React.CSSProperties = {
    fontFamily:      preset.fontFamily + ', sans-serif',
    fontWeight:      preset.bold ? 700 : 400,
    textTransform:   preset.uppercase ? 'uppercase' : 'none',
    color:           preset.highlightColor,
    textShadow:      preset.strokeWidth > 0
      ? `1px 1px 0 ${preset.strokeColor}, -1px -1px 0 ${preset.strokeColor}`
      : preset.glowSize > 0
        ? `0 0 ${Math.round(preset.glowSize / 2)}px ${preset.glowColor}`
        : 'none',
    fontSize:        '18px',
    lineHeight:      1,
    letterSpacing:   '-0.5px',
  };

  return (
    <button
      onClick={onClick}
      style={{
        flexShrink:      0,
        width:           '80px',
        height:          '72px',
        borderRadius:    '8px',
        border:          isActive
          ? '1.5px solid var(--ac-accent)'
          : '1.5px solid var(--ac-border)',
        background:      isActive
          ? 'var(--ac-accent-dim)'
          : 'var(--ac-bg-elevated)',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             '6px',
        cursor:          'pointer',
        transition:      'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow:       isActive ? '0 0 0 2px rgba(124,92,252,0.25)' : 'none',
        padding:         '6px',
      }}
    >
      {/* Mini "Aa" preview */}
      <div
        style={{
          width:        '100%',
          height:       '36px',
          borderRadius: '4px',
          background:   '#000',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          overflow:     'hidden',
        }}
      >
        <span style={previewStyle}>Aa</span>
      </div>
      {/* Preset name */}
      <span style={{
        fontSize:    '10px',
        fontWeight:  isActive ? 600 : 400,
        color:       isActive ? 'var(--ac-accent-text)' : 'var(--ac-text-secondary)',
        lineHeight:  1,
        textTransform: 'capitalize',
        whiteSpace:  'nowrap',
      }}>
        {PRESET_LABELS[preset.preset] ?? preset.preset}
      </span>
    </button>
  );
}

/** Section wrapper with a heading. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{
        fontSize:      '10px',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.7px',
        color:         'var(--ac-text-muted)',
        paddingBottom: '2px',
        borderBottom:  '1px solid var(--ac-border)',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Label + control row. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'center',
      gap:           '8px',
      justifyContent:'space-between',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--ac-text-secondary)', flexShrink: 0, width: '80px' }}>
        {label}
      </span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
        {children}
      </div>
    </div>
  );
}

/** A styled <input type="range"> */
function RangeInput({
  min, max, step = 1, value, onChange, formatValue = String,
}: {
  min: number; max: number; step?: number; value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="prop-range"
        style={{ flex: 1 }}
      />
      <span style={{
        fontSize:     '11px',
        color:        'var(--ac-text-muted)',
        minWidth:     '28px',
        textAlign:    'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {formatValue(value)}
      </span>
    </>
  );
}

/** A styled <input type="color"> */
function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
      <input
        type="color"
        value={isValidHex(value) ? value : '#ffffff'}
        onChange={e => onChange(e.target.value)}
        style={{
          width:        '28px',
          height:       '28px',
          borderRadius: '5px',
          border:       '1px solid var(--ac-border)',
          padding:      '1px',
          background:   'var(--ac-bg-elevated)',
          cursor:       'pointer',
          flexShrink:   0,
        }}
      />
      <span style={{
        fontSize:      '11px',
        color:         'var(--ac-text-muted)',
        fontFamily:    'monospace',
        letterSpacing: '0.03em',
      }}>
        {value}
      </span>
    </div>
  );
}

/** Toggle button (bold / italic / uppercase). */
function ToggleBtn({
  label,
  active,
  onClick,
  title,
  style: extraStyle,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding:       '4px 10px',
        borderRadius:  '5px',
        border:        active
          ? '1px solid var(--ac-accent)'
          : '1px solid var(--ac-border)',
        background:    active ? 'var(--ac-accent-dim)' : 'var(--ac-bg-elevated)',
        color:         active ? 'var(--ac-accent-text)' : 'var(--ac-text-secondary)',
        fontSize:      '11px',
        fontWeight:    600,
        fontFamily:    'inherit',
        cursor:        'pointer',
        transition:    'all 0.12s',
        lineHeight:    1.4,
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function CaptionStyleEditor({ clipId: _clipId, currentStyle, onChange }: Props) {
  const [userPresets, setUserPresets] = useState<{id: number, name: string, style_json: string}[]>([]);
  const [systemFonts, setSystemFonts] = useState<string[]>(FONT_OPTIONS);

  useEffect(() => {
    db.getUserPresets().then(setUserPresets).catch(console.error);
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string[]>('get_system_fonts')
        .then(fonts => {
           setSystemFonts(prev => Array.from(new Set([...prev, ...fonts])).sort());
        })
        .catch(console.error);
    }).catch(console.error);
  }, []);

  const handleSavePreset = async () => {
    const name = window.prompt("Enter a name for your preset:");
    if (!name) return;
    await db.savePreset(name, currentStyle);
    const updated = await db.getUserPresets();
    setUserPresets(updated);
  };

  const s = currentStyle;
  const set = <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) =>
    patch(s, key, value, onChange);

  // Load Google Fonts for preview + rendering
  useEffect(() => {
    const googleFonts = [
      'Montserrat', 'Oswald', 'Roboto', 'Poppins', 'Raleway',
      'Ubuntu', 'Lato', 'Open+Sans', 'Nunito', 'Pacifico',
      'Righteous', 'Anton', 'Bangers', 'Russo+One', 'Teko',
      'Barlow+Condensed',
    ];
    const id = 'gfonts-caption-editor';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${googleFonts.map(f => `family=${f}:wght@400;700`).join('&')}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '18px',
      padding:       '12px',
    }}>

      {/* ── Section 1: Preset Cards ──────────────────────── */}
      <Section label="Preset">
        <div style={{
          display:         'flex',
          gap:             '8px',
          overflowX:       'auto',
          paddingBottom:   '4px',
          /* hide scrollbar but keep scroll */
          scrollbarWidth:  'none',
          /* Show a subtle right-fade to hint scrollability */
          maskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
        }}>
          {CAPTION_PRESETS.map(preset => (
            <PresetCard
              key={preset.preset}
              preset={preset}
              isActive={s.preset === preset.preset}
              onClick={() => onChange(getPreset(preset.preset))}
            />
          ))}
          {userPresets.map(up => {
            let parsedStyle = s;
            try { parsedStyle = JSON.parse(up.style_json); } catch {}
            return (
              <PresetCard
                key={`user-${up.id}`}
                preset={{ ...parsedStyle, preset: up.name }}
                isActive={s.preset === up.name}
                onClick={() => onChange({ ...parsedStyle, preset: up.name })}
              />
            );
          })}
          <button
            onClick={handleSavePreset}
            style={{
              flexShrink: 0,
              width: '80px',
              height: '72px',
              borderRadius: '8px',
              border: '1.5px dashed var(--ac-border)',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ac-text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              transition: 'all 0.15s'
            }}
          >
            + Save
          </button>
        </div>
      </Section>

      {/* ── Section 2: Font ──────────────────────────────── */}
      <Section label="Font">
        {/* Font family */}
        <Row label="Family">
          <select
            value={s.fontFamily}
            onChange={e => set('fontFamily', e.target.value)}
            className="prop-select"
            style={{ flex: 1, fontSize: '11px' }}
          >
            {Array.from(new Set([s.fontFamily, ...systemFonts])).map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <input 
            type="file" 
            accept=".ttf,.otf" 
            id="font-upload" 
            style={{ display: 'none' }} 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                const path = (file as any).path || file.name;
                await invoke('install_font', { path });
                const fonts = await invoke<string[]>('get_system_fonts');
                setSystemFonts(prev => Array.from(new Set([...prev, ...fonts])).sort());
              } catch (err) {
                console.error(err);
              }
              e.target.value = '';
            }}
          />
          <button 
            title="Install Font"
            onClick={() => document.getElementById('font-upload')?.click()}
            style={{ 
              fontSize: '11px', padding: '2px 6px', borderRadius: '4px', 
              border: '1px solid var(--ac-border)', background: 'transparent', 
              cursor: 'pointer', color: 'var(--ac-text-muted)'
            }}
          >
            + Add
          </button>
        </Row>

        {/* Font size */}
        <Row label="Size">
          <RangeInput
            min={24} max={120} step={1}
            value={s.fontSize}
            onChange={v => set('fontSize', v)}
          />
        </Row>

        {/* Style toggles */}
        <Row label="Style">
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ToggleBtn
              label="B"
              title="Bold"
              active={s.bold}
              onClick={() => set('bold', !s.bold)}
              style={{ fontWeight: 900, minWidth: '32px', textAlign: 'center' }}
            />
            <ToggleBtn
              label="I"
              title="Italic"
              active={s.italic}
              onClick={() => set('italic', !s.italic)}
              style={{ fontStyle: 'italic', minWidth: '32px', textAlign: 'center' }}
            />
            <ToggleBtn
              label="AA"
              title="Uppercase"
              active={s.uppercase}
              onClick={() => set('uppercase', !s.uppercase)}
            />
          </div>
        </Row>
        {/* Line height */}
        <Row label="Line H.">
          <RangeInput
            min={0.8} max={2.0} step={0.05}
            value={s.lineHeight}
            onChange={v => set('lineHeight', v)}
          />
        </Row>

        {/* Letter spacing */}
        <Row label="Letter S.">
          <RangeInput
            min={-5} max={20} step={0.5}
            value={s.letterSpacing}
            onChange={v => set('letterSpacing', v)}
            formatValue={v => `${v}px`}
          />
        </Row>
      </Section>

      {/* ── Section 3: Colors ────────────────────────────── */}
      <Section label="Colors">
        <Row label="Text">
          <ColorInput value={s.color} onChange={v => set('color', v)} />
        </Row>
        <Row label="Highlight">
          <ColorInput value={s.highlightColor} onChange={v => set('highlightColor', v)} />
        </Row>
        <Row label="Stroke">
          <ColorInput value={s.strokeColor} onChange={v => set('strokeColor', v)} />
        </Row>
        <Row label="Stroke W.">
          <RangeInput
            min={0} max={8} step={0.5}
            value={s.strokeWidth}
            onChange={v => set('strokeWidth', v)}
          />
        </Row>
        <Row label="Shadow X">
          <RangeInput
            min={-20} max={20} step={1}
            value={s.shadowX}
            onChange={v => set('shadowX', v)}
            formatValue={v => `${v}px`}
          />
        </Row>
        <Row label="Shadow Y">
          <RangeInput
            min={-20} max={20} step={1}
            value={s.shadowY}
            onChange={v => set('shadowY', v)}
            formatValue={v => `${v}px`}
          />
        </Row>
        <Row label="Shadow Blur">
          <RangeInput
            min={0} max={20} step={1}
            value={s.shadowBlur}
            onChange={v => set('shadowBlur', v)}
            formatValue={v => `${v}px`}
          />
        </Row>
      </Section>

      {/* ── Section 4: Effects ───────────────────────────── */}
      <Section label="Effects">
        <Row label="Glow Color">
          <ColorInput value={s.glowColor} onChange={v => set('glowColor', v)} />
        </Row>
        <Row label="Glow Size">
          <RangeInput
            min={0} max={40} step={1}
            value={s.glowSize}
            onChange={v => set('glowSize', v)}
            formatValue={v => v === 0 ? 'Off' : `${v}px`}
          />
        </Row>
        <Row label="Line BG">
          <ToggleBtn
            label="Enable"
            active={s.lineBgEnabled}
            onClick={() => set('lineBgEnabled', !s.lineBgEnabled)}
          />
          {s.lineBgEnabled && (
            <ColorInput value={s.bgColor} onChange={v => set('bgColor', v)} />
          )}
        </Row>
        <Row label="BG Opacity">
          <RangeInput
            min={0} max={100} step={1}
            value={Math.round(s.bgOpacity * 100)}
            onChange={v => set('bgOpacity', v / 100)}
            formatValue={v => `${v}%`}
          />
        </Row>
        <Row label="Fade In">
          <RangeInput
            min={0} max={1} step={0.05}
            value={s.fadeInDuration}
            onChange={v => set('fadeInDuration', v)}
            formatValue={v => `${v.toFixed(2)}s`}
          />
        </Row>
        <Row label="Fade Out">
          <RangeInput
            min={0} max={1} step={0.05}
            value={s.fadeOutDuration}
            onChange={v => set('fadeOutDuration', v)}
            formatValue={v => `${v.toFixed(2)}s`}
          />
        </Row>
        <Row label="Animation">
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {ANIMATION_OPTIONS.map(opt => (
              <ToggleBtn
                key={opt.value}
                label={opt.label}
                active={s.animation === opt.value}
                onClick={() => set('animation', opt.value as CaptionStyle['animation'])}
              />
            ))}
          </div>
        </Row>
        <Row label="Easing">
          <div style={{ display: 'flex', gap: '5px' }}>
            {(['spring', 'ease', 'linear'] as const).map(e => (
              <ToggleBtn key={e} label={e} active={s.animEasing === e} onClick={() => set('animEasing', e)} />
            ))}
          </div>
        </Row>
        <Row label="Speed">
          <RangeInput
            min={0.05} max={1} step={0.05}
            value={s.animDuration}
            onChange={v => set('animDuration', v)}
            formatValue={v => `${v.toFixed(2)}s`}
          />
        </Row>
        <Row label="Karaoke">
          <ToggleBtn
            label={s.karaokeFill ? 'On' : 'Off'}
            active={s.karaokeFill}
            onClick={() => set('karaokeFill', !s.karaokeFill)}
          />
        </Row>
      </Section>

      {/* ── Section 5: Position ───────────────────────────── */}
      <Section label="Position">
        <Row label="X offset">
          <RangeInput
            min={-50} max={50} step={1}
            value={s.x}
            onChange={v => set('x', v)}
            formatValue={v => `${v}%`}
          />
        </Row>
        <Row label="Y offset">
          <RangeInput
            min={0} max={100} step={1}
            value={s.y}
            onChange={v => set('y', v)}
            formatValue={v => `${v}%`}
          />
        </Row>
      </Section>

    </div>
  );
}
