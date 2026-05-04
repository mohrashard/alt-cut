import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TimelineClip, CaptionStyle } from '../lib/db';
import * as db from '../lib/db';
import { parseCaptionStyle } from '../lib/captionPresets';
import { CaptionStyleEditor } from './CaptionStyleEditor';

export interface AppFeatures {
  fontFamily: string;
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
  const [features] = useState<AppFeatures>({
    fontFamily: 'Arial',
    captionX: 0,
    captionY: 80, // Default to bottom area
  });
  const [log, setLog] = useState<string>('');

  useEffect(() => { onFeaturesChange(features); }, [features, onFeaturesChange]);

  // Reset log when clip changes
  useEffect(() => { setLog(''); }, [selectedClip?.id]);



  // ── Caption Style State ────────────────────────────────────
  const clipCaptionStyleRaw = selectedClip?.caption_style;
  const parsedCaptionStyle = useMemo(
    () => parseCaptionStyle(clipCaptionStyleRaw ?? null),
    [clipCaptionStyleRaw]
  );

  const [localCaptionStyle, setLocalCaptionStyle] = useState<CaptionStyle>(parsedCaptionStyle);

  // Sync when clip changes
  const prevClipIdRef = useRef<number | string | undefined>(undefined);
  useEffect(() => {
    if (selectedClip?.id !== prevClipIdRef.current) {
      setLocalCaptionStyle(parsedCaptionStyle);
      prevClipIdRef.current = selectedClip?.id;
    }
  }, [parsedCaptionStyle, selectedClip?.id]);

  const clipIdRef = useRef<number | string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const handleCaptionStyleChange = useCallback((newStyle: CaptionStyle) => {
    const currentClipId = selectedClip?.id;
    if (!currentClipId) return;
    setLocalCaptionStyle(newStyle);

    clipIdRef.current = currentClipId;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      if (clipIdRef.current !== currentClipId) {
        return;
      }
      await db.updateCaptionStyle(currentClipId, newStyle);
      onTimelineChange();
    }, 300);
  }, [selectedClip?.id, onTimelineChange]);

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
        // TODO: Add parent_clip_id to timeline_clips schema for proper hierarchy tracking.
        // For now, filter the deletion by track_lane === 0 and timeline_start within the selectedClip's bounds.
        const clipDuration = selectedClip.end_time - selectedClip.start_time;
        await db.clearTextClipsWithinBounds(
          selectedClip.project_id, 
          selectedClip.timeline_start, 
          selectedClip.timeline_start + clipDuration
        );

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
        <div className="prop-empty">Select a clip to inspect</div>
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

            {/* ── Caption Style Editor ─────── */}
            {(selectedClip.track_type === 'text' || selectedClip.ai_metadata?.['captions']?.status === 'completed' || !!selectedClip.ai_metadata?.['captions']?.json_data) && (
              <div className="prop-section">
                <div className="prop-section-header">Caption Style</div>
                <CaptionStyleEditor
                  clipId={String(selectedClip.id)}
                  currentStyle={localCaptionStyle}
                  onChange={handleCaptionStyleChange}
                />
              </div>
            )}

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
