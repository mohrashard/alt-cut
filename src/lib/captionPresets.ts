import type { CaptionStyle } from './db';

// ─── Presets ──────────────────────────────────────────────────

export const CAPTION_PRESETS: CaptionStyle[] = [
  {
    preset:         'hormozi',
    fontFamily:     'Arial',
    fontSize:       72,
    color:          '#FFFFFF',
    strokeColor:    '#000000',
    strokeWidth:    3,
    glowColor:      '#7c5cfc',
    glowSize:       0,
    bgColor:        'transparent',
    bgOpacity:      0,
    bold:           true,
    italic:         false,
    uppercase:      true,
    highlightColor: '#f5c542',
    animation:      'pop',
  },
  {
    preset:         'neon',
    fontFamily:     'Arial',
    fontSize:       72,
    color:          '#FFFFFF',
    strokeColor:    '#000000',
    strokeWidth:    0,
    glowColor:      '#7c5cfc',
    glowSize:       12,
    bgColor:        '#000000',
    bgOpacity:      0.6,
    bold:           true,
    italic:         false,
    uppercase:      false,
    highlightColor: '#7c5cfc',
    animation:      'fade',
  },
  {
    preset:         'minimal',
    fontFamily:     'Arial',
    fontSize:       72,
    color:          '#FFFFFF',
    strokeColor:    '#000000',
    strokeWidth:    0,
    glowColor:      '#7c5cfc',
    glowSize:       0,
    bgColor:        'transparent',
    bgOpacity:      0,
    bold:           false,
    italic:         false,
    uppercase:      false,
    highlightColor: '#FFFFFF',
    animation:      'none',
  },
  {
    preset:         'karaoke',
    fontFamily:     'Arial',
    fontSize:       72,
    color:          '#FFFFFF',
    strokeColor:    '#000000',
    strokeWidth:    2,
    glowColor:      '#7c5cfc',
    glowSize:       0,
    bgColor:        'transparent',
    bgOpacity:      0,
    bold:           true,
    italic:         false,
    uppercase:      false,
    highlightColor: '#f5c542',
    animation:      'pop',
  },
];

// ─── Helpers ──────────────────────────────────────────────────

/** Returns the preset matching `name`, or the 'hormozi' preset as a fallback. */
export function getPreset(name: string): CaptionStyle {
  return (
    CAPTION_PRESETS.find((p) => p.preset === name) ??
    CAPTION_PRESETS[0] // hormozi is the default
  );
}

/**
 * Parse a raw caption_style DB string into a full CaptionStyle object.
 * Falls back to the 'hormozi' preset when the value is empty / null / invalid.
 * Merges over the preset so any missing keys always have sane defaults.
 */
export function parseCaptionStyle(raw: string | null | undefined): CaptionStyle {
  const fallback = CAPTION_PRESETS[0]; // hormozi
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      return { ...fallback, ...parsed } as CaptionStyle;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}
