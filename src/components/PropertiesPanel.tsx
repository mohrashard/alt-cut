import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TimelineClip, ClipEffects } from '../lib/db';
import * as db from '../lib/db';

const DEFAULT_EFFECTS: ClipEffects = {
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  blur: 0,
  sharpen: 0,
};

export interface AppFeatures {
  fontFamily: string;
  animationStyle: string;
  captionX: number; // Percentage offset from center (0 = center)
  captionY: number; // Percentage from top (0-100)
}

// Shape returned by the Rust run_ai_job command
interface AiJobResult {
  output_path: string;
  stdout: string;
}

interface PropertiesProps {
  selectedClip: TimelineClip | null;
  onFeaturesChange: (f: AppFeatures) => void;
  onTimelineChange: () => void;
}

// ─── Status badge ────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'queued') return null;
  const map: Record<string, { label: string; color: string }> = {
    processing: { label: '⚙️ Processing…', color: '#f59e0b' },
    completed:  { label: '✅ Done',          color: '#10b981' },
    failed:     { label: '❌ Failed',         color: '#ef4444' },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, color: s.color, marginLeft: '6px' }}>
      {s.label}
    </span>
  );
}

export function PropertiesPanel({ selectedClip, onFeaturesChange, onTimelineChange }: PropertiesProps) {
  const [features, setFeatures] = useState<AppFeatures>({
    fontFamily: 'Arial',
    animationStyle: 'hormozi',
    captionX: 0,
    captionY: 80, // Default to bottom area
  });
  const [log, setLog] = useState<string>('');

  useEffect(() => { onFeaturesChange(features); }, [features, onFeaturesChange]);

  // Reset log when clip changes
  useEffect(() => { setLog(''); }, [selectedClip?.id]);

  const updateSelect = (key: keyof AppFeatures, value: any) =>
    setFeatures(prev => ({ ...prev, [key]: value }));

  // ── Effects State ─────────────────────────────────────────
  const clipEffectsRaw = selectedClip?.effects;
  const defaultParsedEffects = useMemo(() => {
    try {
      return { ...DEFAULT_EFFECTS, ...JSON.parse(clipEffectsRaw || '{}') };
    } catch {
      return DEFAULT_EFFECTS;
    }
  }, [clipEffectsRaw]);

  const [localEffects, setLocalEffects] = useState<ClipEffects>(defaultParsedEffects);

  useEffect(() => {
    setLocalEffects(defaultParsedEffects);
  }, [defaultParsedEffects]);

  const handleEffectChange = async (key: keyof ClipEffects, value: number) => {
    if (!selectedClip) return;
    const newEffects = { ...localEffects, [key]: value };
    setLocalEffects(newEffects);
    await db.updateClipEffects(selectedClip.id, newEffects);
    onTimelineChange();
  };

  // ──────────────────────────────────────────────────────────
  // Main AI job handler
  // ──────────────────────────────────────────────────────────
  const handleRunAiJob = async (step: string) => {
    if (!selectedClip?.file_path) {
      alert('No clip selected or clip has no file path.');
      return;
    }

    const clipId  = selectedClip.id;
    const assetId = selectedClip.asset_id;
    const filePath = selectedClip.file_path;

    // Determine output filename (relative to project root — Rust resolves to absolute)
    const outputPath = step === 'captions'
      ? `captions_${clipId}.json`
      : `denoise_${clipId}.mp4`;

    setLog('');
    try {
      // Mark as processing in DB so UI shows spinner
      await db.upsertAiMetadata(clipId, step, 'processing');
      onTimelineChange();

      setLog(`▶ Starting ${step} job on: ${filePath.split(/[/\\]/).pop()}\n`);

      // ── Invoke Rust command ──────────────────────────────
      const result = await invoke<AiJobResult>('run_ai_job', {
        filePath,
        step,
        outputPath,
      });

      setLog(prev => prev + `\n${result.stdout}\n✅ Output: ${result.output_path}`);

      // ── Post-process based on step ───────────────────────
      if (step === 'captions') {
        // Read the JSON file via Rust (absolute path now)
        const rawJson = await invoke<string>('load_captions_file', { path: result.output_path });

        // Validate JSON shape
        let parsed: any;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          throw new Error(`Caption JSON invalid:\n${rawJson.slice(0, 200)}`);
        }

        if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
          throw new Error(`Caption JSON missing "chunks" array. Got: ${JSON.stringify(parsed).slice(0, 200)}`);
        }

        // Store in DB
        await db.upsertAiMetadata(clipId, step, 'completed', rawJson);
        
        // Clear old text clips to prevent duplicates on regenerate
        await db.clearTextClips(selectedClip.project_id);

        const clipStart = selectedClip.start_time;
        const clipEnd = selectedClip.end_time;
        let addedCount = 0;

        // Auto-populate text track
        for (const chunk of parsed.chunks) {
          if (!chunk.text) continue;
          
          // Only include chunks that overlap with the selected clip's visible region
          if (chunk.end <= clipStart || chunk.start >= clipEnd) continue;

          // Clamp the chunk's start and end times to the clip's bounds so they don't leak
          const clampedStart = Math.max(chunk.start, clipStart);
          const clampedEnd = Math.min(chunk.end, clipEnd);
          const duration = clampedEnd - clampedStart;
          
          if (duration <= 0) continue;

          // The start of the chunk relative to the clip's start time
          const relativeStart = clampedStart - clipStart;
          const timelineStart = selectedClip.timeline_start + relativeStart;

          // Clone the chunk and update its start/end so TextClip calculates assetSeconds correctly
          const chunkToSave = { ...chunk, start: clampedStart, end: clampedEnd };

          // Create dummy asset for text, storing the entire chunk JSON for word-level highlighting
          const chunkJson = JSON.stringify(chunkToSave);
          const asset = await db.addAsset(selectedClip.project_id, `text://${chunkJson}`, 'text', duration);
          await db.addClipToTimelineSpecific(
            selectedClip.project_id,
            asset.id,
            duration,
            'text',
            0,
            timelineStart
          );
          addedCount++;
        }

        setLog(prev => prev + `\n📝 ${addedCount} caption chunks added to text track.`);

      } else if (step === 'denoise') {
        // Update the asset's file_path so the preview uses the clean video
        await db.updateAssetFilePath(assetId, result.output_path);
        await db.upsertAiMetadata(clipId, step, 'completed', result.output_path);
        setLog(prev => prev + `\n🎧 Denoised video applied to clip.`);
      }

      onTimelineChange();

    } catch (err: any) {
      const msg = String(err);
      setLog(prev => prev + `\n❌ ERROR: ${msg}`);
      await db.upsertAiMetadata(clipId, step, 'failed');
      onTimelineChange();
      alert(`AI Job Failed (${step}):\n\n${msg}`);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Shorthand status helpers
  // ──────────────────────────────────────────────────────────
  const captionStatus  = selectedClip?.ai_metadata?.['captions']?.status;
  const denoiseStatus  = selectedClip?.ai_metadata?.['denoise']?.status;
  const isCaptionBusy  = captionStatus  === 'processing';
  const isDenoiseBusy  = denoiseStatus  === 'processing';

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  return (
    <div className="prop-inspector">
      {!selectedClip ? (
        <div className="prop-empty">Select a clip to edit</div>
      ) : (
        <>
          {/* ── Header ────────────────────────────────────── */}
          <div className="prop-header">
            <div className="prop-header-label">Inspector</div>
            <div className="prop-header-title" title={selectedClip.file_path}>
              {selectedClip.file_path?.split(/[/\\]/).pop() || 'Untitled Clip'}
            </div>
          </div>

          {/* ── Content area (scrollable) ─────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            
            {/* ── Transform ───────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">Transform</div>
              
              <div className="prop-slider-row">
                <div className="prop-slider-label">Scale</div>
                <div className="prop-slider-container">
                  <input type="range" min="50" max="150" defaultValue="100" className="prop-range" />
                </div>
                <div className="prop-slider-value">100%</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Volume</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={(selectedClip.audio_volume || 1.0) * 100}
                    onChange={e => {
                      const vol = parseFloat(e.target.value) / 100;
                      db.setAudioVolume(selectedClip.id, vol).then(onTimelineChange);
                    }}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{Math.round((selectedClip.audio_volume || 1.0) * 100)}%</div>
              </div>
            </div>

            {/* ── Effects ─────────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">
                Effects
                {/* Reset button could go here as an action link if needed */}
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Brightness</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localEffects.brightness}
                    onChange={e => handleEffectChange('brightness', parseFloat(e.target.value))}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{localEffects.brightness.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Contrast</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localEffects.contrast}
                    onChange={e => handleEffectChange('contrast', parseFloat(e.target.value))}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{localEffects.contrast.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Saturation</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localEffects.saturation}
                    onChange={e => handleEffectChange('saturation', parseFloat(e.target.value))}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{localEffects.saturation.toFixed(1)}</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Blur</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={localEffects.blur}
                    onChange={e => handleEffectChange('blur', parseInt(e.target.value, 10))}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{localEffects.blur}px</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Sharpen</div>
                <div className="prop-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={localEffects.sharpen}
                    onChange={e => handleEffectChange('sharpen', parseFloat(e.target.value))}
                    className="prop-range"
                  />
                </div>
                <div className="prop-slider-value">{localEffects.sharpen.toFixed(1)}</div>
              </div>
            </div>

            {/* ── Transitions ─────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">Transitions</div>
              <div className="prop-chip-row">
                {['None', 'Ink', 'Wipe', 'Shutter'].map(type => (
                  <button
                    key={type}
                    className={`prop-chip ${type === 'None' ? 'prop-chip--active' : ''}`}
                    onClick={() => {}} // Not wired yet per instructions to keep logic
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Typography ──────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">Typography & Style</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select className="prop-select" style={{ width: '100%' }} value={features.fontFamily} onChange={e => updateSelect('fontFamily', e.target.value)}>
                  <option value="Arial">Arial</option>
                  <option value="Impact">Impact</option>
                  <option value="Proxima Nova">Proxima Nova</option>
                </select>
                <select className="prop-select" style={{ width: '100%' }} value={features.animationStyle} onChange={e => updateSelect('animationStyle', e.target.value)}>
                  <option value="hormozi">Hormozi Pop (yellow)</option>
                  <option value="karaoke">Karaoke Flow (green)</option>
                </select>
              </div>
            </div>

            {/* ── AI Tools ────────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">
                AI Tools
                <StatusBadge status={captionStatus || denoiseStatus} />
              </div>
              <div className="prop-ai-btn-row">
                <button
                  className="prop-ai-btn"
                  onClick={() => handleRunAiJob('captions')}
                  disabled={isCaptionBusy}
                >
                  <div className="prop-dot prop-dot--purple" />
                  {isCaptionBusy ? 'Busy...' : 'Captions'}
                </button>
                <button
                  className="prop-ai-btn"
                  onClick={() => handleRunAiJob('denoise')}
                  disabled={isDenoiseBusy}
                >
                  <div className="prop-dot prop-dot--green" />
                  {isDenoiseBusy ? 'Busy...' : 'Denoise'}
                </button>
              </div>
              {log && (
                <pre style={{
                  background: 'var(--ac-bg-overlay)',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '10px',
                  color: 'var(--ac-text-muted)',
                  marginTop: '12px',
                  maxHeight: '100px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  border: '1px solid var(--ac-border-subtle)'
                }}>
                  {log}
                </pre>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
