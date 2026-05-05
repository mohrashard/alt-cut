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

const ANIMATION_OPTIONS: { value: CaptionStyle['animation']; label: string }[] = [
  { value: 'pop', label: 'Pop' },
  { value: 'fade', label: 'Fade' },
  { value: 'none', label: 'None' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'shake', label: 'Shake' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'typewriter', label: 'Type' },
];

const FONT_OPTIONS = [
  'Arial', 'Impact', 'Montserrat', 'Oswald', 'Bebas Neue', 'Roboto', 'Poppins', 'Raleway', 'Inter'
];

const PRESET_LABELS: Record<string, string> = {
  hormozi: 'Hormozi',
  neon: 'Neon',
  minimal: 'Minimal',
  karaoke: 'Karaoke',
};

// ─── Sub-components ───────────────────────────────────────────

function PresetCard({ preset, isActive, onClick }: { preset: CaptionStyle; isActive: boolean; onClick: () => void; }) {
  const previewStyle: React.CSSProperties = {
    fontFamily: preset.fontFamily + ', sans-serif',
    fontWeight: preset.bold ? 700 : 400,
    textTransform: preset.uppercase ? 'uppercase' : 'none',
    color: preset.highlightColor,
    textShadow: preset.strokeWidth > 0
      ? `1px 1px 0 ${preset.strokeColor}`
      : 'none',
    fontSize: '18px',
  };

  return (
    <button
      onClick={onClick}
      className={`cs-preset-card ${isActive ? 'cs-preset-card--active' : ''}`}
      style={{
        flexShrink: 0, width: '80px', height: '72px', borderRadius: '8px',
        border: isActive ? '1.5px solid var(--ac-accent)' : '1.5px solid var(--ac-border)',
        background: isActive ? 'var(--ac-accent-dim)' : 'var(--ac-bg-elevated)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: '6px', gap: '4px'
      }}
    >
      <div style={{ width: '100%', height: '36px', background: '#000', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={previewStyle}>Aa</span>
      </div>
      <span style={{ fontSize: '10px', color: isActive ? 'var(--ac-accent-text)' : 'var(--ac-text-secondary)' }}>
        {PRESET_LABELS[preset.preset] ?? preset.preset}
      </span>
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cs-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="cs-section-label" style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ac-text-muted)', borderBottom: '1px solid var(--ac-border)', paddingBottom: '4px' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cs-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '11px', color: 'var(--ac-text-secondary)', width: '80px' }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>{children}</div>
    </div>
  );
}

function RangeInput({ min, max, step = 1, value, onChange }: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void; }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');

  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="prop-range" style={{ flex: 1 }} />
      {editing ? (
        <input autoFocus value={temp} onChange={e => setTemp(e.target.value)} onBlur={() => { onChange(Number(temp) || value); setEditing(false); }} onKeyDown={e => e.key === 'Enter' && (onChange(Number(temp) || value), setEditing(false))} style={{ width: '40px', fontSize: '11px', background: 'var(--ac-bg-elevated)', border: '1px solid var(--ac-accent)', color: '#fff', textAlign: 'right' }} />
      ) : (
        <span onClick={() => { setTemp(String(value)); setEditing(true); }} style={{ fontSize: '11px', color: 'var(--ac-text-muted)', minWidth: '24px', textAlign: 'right', cursor: 'text' }}>{value}</span>
      )}
    </>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void; }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input type="color" value={isValidHex(value) ? value : '#ffffff'} onChange={e => onChange(e.target.value)} style={{ width: '24px', height: '24px', border: 'none', background: 'none', cursor: 'pointer' }} />
      <span style={{ fontSize: '11px', color: 'var(--ac-text-muted)', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// Module-level cache to prevent redundant OS calls for fonts
let cachedSystemFonts: string[] | null = null;

export function CaptionStyleEditor({ clipId, currentStyle, onChange }: Props) {
  const [userPresets, setUserPresets] = useState<any[]>([]);
  const [systemFonts, setSystemFonts] = useState<string[]>(cachedSystemFonts || FONT_OPTIONS);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    db.getUserPresets().then(setUserPresets).catch(console.error);

    if (cachedSystemFonts) return;

    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string[]>('get_system_fonts').then(fonts => {
        const unique = Array.from(new Set([...FONT_OPTIONS, ...fonts])).sort();
        cachedSystemFonts = unique;
        setSystemFonts(unique);
      }).catch(console.error);
    });
  }, []);

  const s = currentStyle;
  const set = <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) => patch(s, key, value, onChange);

  return (
    <div className="cs-editor" data-clip-id={clipId} style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '12px' }}>
      <Section label="Preset">
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {CAPTION_PRESETS.map(p => (
            <PresetCard key={p.preset} preset={p} isActive={s.preset === p.preset} onClick={() => onChange(getPreset(p.preset))} />
          ))}
          {userPresets.map(up => (
            <PresetCard key={up.id} preset={{ ...JSON.parse(up.style_json), preset: up.name }} isActive={s.preset === up.name} onClick={() => onChange({ ...JSON.parse(up.style_json), preset: up.name })} />
          ))}
          <button onClick={() => setSavingPreset(true)} style={{ flexShrink: 0, width: '80px', height: '72px', borderRadius: '8px', border: '1.5px dashed var(--ac-border)', background: 'none', color: 'var(--ac-text-muted)', cursor: 'pointer' }}>+ Save</button>
        </div>
        {savingPreset && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input autoFocus placeholder="Name..." value={presetName} onChange={e => setPresetName(e.target.value)} style={{ flex: 1, background: 'var(--ac-bg-elevated)', border: '1px solid var(--ac-accent)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }} />
            <button onClick={async () => { if (!presetName) return; await db.savePreset(presetName, s); setSavingPreset(false); db.getUserPresets().then(setUserPresets); }} style={{ background: 'var(--ac-accent)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '12px' }}>Save</button>
            <button onClick={() => setSavingPreset(false)} style={{ background: 'none', border: '1px solid var(--ac-border)', color: 'var(--ac-text-muted)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>✕</button>
          </div>
        )}
      </Section>

      <Section label="Font">
        <Row label="Family">
          <select value={s.fontFamily} onChange={e => set('fontFamily', e.target.value)} className="prop-select" style={{ flex: 1 }}>
            {systemFonts.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Row>
        <Row label="Size">
          <RangeInput min={10} max={200} value={s.fontSize} onChange={v => set('fontSize', v)} />
        </Row>
        <Row label="Style">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => set('bold', !s.bold)} style={{ background: s.bold ? 'var(--ac-accent)' : 'none', border: '1px solid var(--ac-border)', color: '#fff', padding: '4px 12px', borderRadius: '4px' }}>B</button>
            <button onClick={() => set('italic', !s.italic)} style={{ background: s.italic ? 'var(--ac-accent)' : 'none', border: '1px solid var(--ac-border)', color: '#fff', padding: '4px 12px', borderRadius: '4px', fontStyle: 'italic' }}>I</button>
            <button onClick={() => set('uppercase', !s.uppercase)} style={{ background: s.uppercase ? 'var(--ac-accent)' : 'none', border: '1px solid var(--ac-border)', color: '#fff', padding: '4px 12px', borderRadius: '4px' }}>AA</button>
          </div>
        </Row>
      </Section>

      <Section label="Colors & Stroke">
        <Row label="Main Color">
          <ColorInput value={s.color} onChange={v => set('color', v)} />
        </Row>
        <Row label="Highlight">
          <ColorInput value={s.highlightColor} onChange={v => set('highlightColor', v)} />
        </Row>
        <Row label="Stroke Color">
          <ColorInput value={s.strokeColor} onChange={v => set('strokeColor', v)} />
        </Row>
        <Row label="Stroke Width">
          <RangeInput min={0} max={20} value={s.strokeWidth} onChange={v => set('strokeWidth', v)} />
        </Row>
      </Section>

      <Section label="Animation">
        <Row label="Type">
          <select value={s.animation} onChange={e => set('animation', e.target.value as any)} className="prop-select" style={{ flex: 1 }}>
            {ANIMATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </Row>
        <Row label="Duration">
          <RangeInput min={0.05} max={1.0} step={0.05} value={s.animDuration} onChange={v => set('animDuration', v)} />
        </Row>
      </Section>
    </div>
  );
}