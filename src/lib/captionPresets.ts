// Load Proxima Nova via Adobe Fonts CDN fallback (web-safe alternative)
// In production, install the actual font via install_font Tauri command
if (typeof document !== 'undefined') {
  const id = 'proxima-nova-fallback';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    // Proxima Nova is a paid font; we define a CSS fallback stack that approximates it
    style.textContent = `
      @font-face {
        font-family: 'Proxima Nova';
        src: local('Montserrat'), local('Arial Rounded MT Bold'), local('Arial');
        font-weight: 400 700;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);
  }
}

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
    x:              0,
    y:              80,
    lineBgEnabled:  false,
    lineBgPadding:  8,
    animDuration:   0.3,
    animEasing:     'spring',
    karaokeFill:    false,
    shadowX:        4,
    shadowY:        4,
    shadowBlur:     0,
    lineHeight:     1.15,
    letterSpacing:  0,
    fadeInDuration: 0.2,
    fadeOutDuration: 0.2,
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
    x:              0,
    y:              80,
    lineBgEnabled:  false,
    lineBgPadding:  8,
    animDuration:   0.3,
    animEasing:     'spring',
    karaokeFill:    false,
    shadowX:        4,
    shadowY:        4,
    shadowBlur:     0,
    lineHeight:     1.15,
    letterSpacing:  0,
    fadeInDuration: 0.2,
    fadeOutDuration: 0.2,
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
    x:              0,
    y:              80,
    lineBgEnabled:  false,
    lineBgPadding:  8,
    animDuration:   0.3,
    animEasing:     'spring',
    karaokeFill:    false,
    shadowX:        4,
    shadowY:        4,
    shadowBlur:     0,
    lineHeight:     1.15,
    letterSpacing:  0,
    fadeInDuration: 0.2,
    fadeOutDuration: 0.2,
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
    x:              0,
    y:              80,
    lineBgEnabled:  false,
    lineBgPadding:  8,
    animDuration:   0.3,
    animEasing:     'spring',
    karaokeFill:    true,
    shadowX:        4,
    shadowY:        4,
    shadowBlur:     0,
    lineHeight:     1.15,
    letterSpacing:  0,
    fadeInDuration: 0.2,
    fadeOutDuration: 0.2,
  },
];

// ─── Helpers ──────────────────────────────────────────────────

/** Returns the preset matching `name`, or the 'hormozi' preset as a fallback. */
export function getPreset(name: string): CaptionStyle {
  const fallback = CAPTION_PRESETS[0]; // hormozi is the default
  const preset = CAPTION_PRESETS.find((p) => p.preset === name) ?? fallback;

  if (!['pop', 'fade', 'bounce', 'shake', 'zoom', 'typewriter', 'none'].includes(preset.animation)) {
    return { ...preset, animation: fallback.animation };
  }

  return preset;
}

/**
 * Parse a raw caption_style DB string into a full CaptionStyle object.
 * Falls back to the 'hormozi' preset when the value is empty / null / invalid.
 * Merges over the preset so any missing keys always have sane defaults.
 */
export function parseCaptionStyle(raw: string | null | undefined): CaptionStyle {
  const fallback = CAPTION_PRESETS[0]; // hormozi
  if (!raw || raw === '{}') return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      const merged = { ...fallback, ...parsed } as CaptionStyle;
      if (!['pop', 'fade', 'bounce', 'shake', 'zoom', 'typewriter', 'none'].includes(merged.animation)) {
        merged.animation = fallback.animation;
      }
      return merged;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}
