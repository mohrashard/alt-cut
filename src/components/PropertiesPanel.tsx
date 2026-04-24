import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TimelineClip } from '../lib/db';
import * as db from '../lib/db';

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
        setLog(prev => prev + `\n📝 ${parsed.chunks.length} caption chunks saved.`);

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
    <div className="panel-right">
      <div className="panel-right-header">Details</div>

      <div className="panel-right-content">
        {!selectedClip ? (
          <div className="panel-empty">
            <div style={{ fontSize: '28px' }}>🎞️</div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>No clip selected</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Click a clip in the timeline to view and edit its properties.
            </div>
          </div>
        ) : (
          <>
            {/* ── Clip Info ─────────────────────────────── */}
            <div>
              <div className="panel-section-label">Clip Info</div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '8px' }}>
                <div className="panel-row">
                  <span className="panel-row-label">Name</span>
                  <span className="panel-row-value" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedClip.file_path}>
                    {selectedClip.file_path?.split(/[/\\]/).pop()}
                  </span>
                </div>
                <div className="panel-row">
                  <span className="panel-row-label">Duration</span>
                  <span className="panel-row-value">{((selectedClip.end_time - selectedClip.start_time) || 0).toFixed(2)}s</span>
                </div>
                <div className="panel-row">
                  <span className="panel-row-label">Type</span>
                  <span className="panel-row-value">{selectedClip.type || 'video'}</span>
                </div>
              </div>
            </div>

            {/* ── AI Tools ──────────────────────────────── */}
            <div>
              <div className="panel-section-label">AI Tools</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Caption generation */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Caption Generation</span>
                    <StatusBadge status={captionStatus} />
                  </div>
                  <button
                    className="ai-btn ai-btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => handleRunAiJob('captions')}
                    disabled={isCaptionBusy}
                  >
                    {isCaptionBusy
                      ? <><span className="spin" style={{ display: 'inline-block' }}>⚙️</span> Transcribing + Chunking…</>
                      : captionStatus === 'completed'
                        ? '✅ Regenerate Captions'
                        : '📝 Generate Captions'}
                  </button>
                  {captionStatus === 'completed' && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                      Whisper → Gemma4 chunking → Live in preview
                    </div>
                  )}
                </div>

                {/* Denoise */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Audio Clean (DeepFilterNet)</span>
                    <StatusBadge status={denoiseStatus} />
                  </div>
                  <button
                    className="ai-btn ai-btn-secondary"
                    style={{ width: '100%' }}
                    onClick={() => handleRunAiJob('denoise')}
                    disabled={isDenoiseBusy}
                  >
                    {isDenoiseBusy
                      ? <><span className="spin" style={{ display: 'inline-block' }}>⚙️</span> Denoising Audio…</>
                      : denoiseStatus === 'completed'
                        ? '✅ Re-run Denoise'
                        : '🎧 Clean & Remove Noise'}
                  </button>
                  {denoiseStatus === 'completed' && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                      Clip now points to denoised video
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Process Log ───────────────────────────── */}
            {log && (
              <div>
                <div className="panel-section-label">Process Log</div>
                <pre style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}>
                  {log}
                </pre>
              </div>
            )}

            {/* ── Typography & Style ────────────────────── */}
            <div>
              <div className="panel-section-label">Typography & Style</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Font Family</div>
                  <select className="prop-select" value={features.fontFamily} onChange={e => updateSelect('fontFamily', e.target.value)}>
                    <option value="Arial">Arial</option>
                    <option value="Impact">Impact</option>
                    <option value="Proxima Nova">Proxima Nova</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Caption Style</div>
                  <select className="prop-select" value={features.animationStyle} onChange={e => updateSelect('animationStyle', e.target.value)}>
                    <option value="hormozi">Hormozi Pop (yellow highlight)</option>
                    <option value="karaoke">Karaoke Flow (neon green)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Transform ─────────────────────────────── */}
            <div>
              <div className="panel-section-label">Transform</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Scale</span><span>100%</span>
                  </div>
                  <input type="range" min="50" max="150" defaultValue="100" className="prop-range" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Volume</span><span>100%</span>
                  </div>
                  <input type="range" min="0" max="200" defaultValue="100" className="prop-range" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
