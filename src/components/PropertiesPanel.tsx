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
  playheadSeconds: number;
  onStylePreview?: (clipId: number | string | null, style: CaptionStyle | null) => void;
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

export function PropertiesPanel({ 
  selectedClip, onFeaturesChange, onTimelineChange, playheadSeconds, onStylePreview 
}: PropertiesProps) {
  const [features] = useState<AppFeatures>({
    fontFamily: 'Arial',
    captionX: 0,
    captionY: 80, // Default to bottom area
  });
  const [log, setLog] = useState<string>('');
  const [clipScale, setClipScale] = useState<number>(100);
  const [localVolume, setLocalVolume] = useState<number>(1.0);
  const volumeDebounceRef = useRef<number | null>(null);
  const scaleDebounceRef = useRef<number | null>(null);
  const textSaveDebounceRef = useRef<number | null>(null);
  const lastTextRef = useRef<string>('');

  useEffect(() => { onFeaturesChange(features); }, [features, onFeaturesChange]);

  // Reset log when clip changes
  useEffect(() => {
    setLog('');
    setClipScale((selectedClip?.scale ?? 1.0) * 100);
    setLocalVolume(selectedClip?.audio_volume ?? 1.0);
  }, [selectedClip?.id]);



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
      if (onStylePreview) onStylePreview(null, null);
    }
  }, [parsedCaptionStyle, selectedClip?.id, onStylePreview]);

  const clipIdRef = useRef<number | string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const handleCaptionStyleChange = useCallback((newStyle: CaptionStyle) => {
    const currentClipId = selectedClip?.id;
    if (!currentClipId) return;
    setLocalCaptionStyle(newStyle);
    if (onStylePreview) onStylePreview(currentClipId, newStyle);

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

  const handleApplyToAll = async () => {
    if (!selectedClip) return;
    const allClips = await db.getTimelineClips(selectedClip.project_id);
    const textClips = allClips.filter(c => c.track_type === 'text');
    
    await Promise.all(textClips.map(clip => db.updateCaptionStyle(clip.id, localCaptionStyle)));
    onTimelineChange();
  };

  const handleManualCaption = async () => {
    const text = window.prompt("Enter caption text:");
    if (!text) return;
    
    const projectId = selectedClip?.project_id || 1; 
    const words = text.split(' ').map((w, i) => ({
      word: w,
      start: i * 0.5,
      end: (i + 1) * 0.5
    }));
    const duration = words.length * 0.5;
    const chunkData = { text, words };
    const asset = await db.addAsset(projectId, `text://${JSON.stringify(chunkData)}`, 'text', duration);
    await db.addClipToTimelineSpecific(
      projectId,
      asset.id,
      duration,
      'text',
      0,
      playheadSeconds
    );
    onTimelineChange();
  };

  // ── Caption Words State ─────────────────────────────────────
  const [localWords, setLocalWords] = useState<any[]>([]);
  const [localText, setLocalText] = useState<string>('');

  useEffect(() => {
    if (selectedClip?.track_type === 'text' && selectedClip.file_path?.startsWith('text://')) {
      try {
        const chunkData = JSON.parse(selectedClip.file_path.substring(7));
        setLocalWords(chunkData.words || []);
        setLocalText(chunkData.text || '');
      } catch (e) {
        setLocalWords([]);
        setLocalText('');
      }
    } else {
      setLocalWords([]);
      setLocalText('');
    }
  }, [selectedClip?.file_path, selectedClip?.track_type, selectedClip?.id]);

  const handleTextChange = (newText: string) => {
    setLocalText(newText);
    lastTextRef.current = newText;
    const currentClipId = selectedClip?.id;
    const currentAssetId = selectedClip?.asset_id;
    if (!currentClipId || !currentAssetId) return;

    // Immediately compute and sync UI
    try {
      const filePath = selectedClip?.file_path || '';
      if (filePath.startsWith('text://')) {
        const data = JSON.parse(filePath.substring(7));
        const oldWords = data.words || [];
        const newTokens = newText.trim().split(/\s+/).filter(Boolean);
        const mergedWords = newTokens.map((token, i) => {
          if (oldWords[i]) return { ...oldWords[i], word: token };
          const lastEnd = oldWords[oldWords.length - 1]?.end ?? 0;
          return { word: token, start: lastEnd + i * 0.3, end: lastEnd + (i + 1) * 0.3 };
        });
        setLocalWords(mergedWords);
        onTimelineChange(); // Trigger real-time preview update
      }
    } catch (e) {}

    if (textSaveDebounceRef.current) window.clearTimeout(textSaveDebounceRef.current);

    textSaveDebounceRef.current = window.setTimeout(async () => {
      const textToSave = lastTextRef.current;
      const filePath = selectedClip?.file_path || '';
      if (!filePath.startsWith('text://')) return;
      try {
        const data = JSON.parse(filePath.substring(7));
        const oldWords = data.words || [];
        const newTokens = textToSave.trim().split(/\s+/).filter(Boolean);
        const finalMerged = newTokens.map((token, i) => {
          if (oldWords[i]) return { ...oldWords[i], word: token };
          const lastEnd = oldWords[oldWords.length - 1]?.end ?? 0;
          return { word: token, start: lastEnd + i * 0.3, end: lastEnd + (i + 1) * 0.3 };
        });
        const updated = { ...data, text: textToSave, words: finalMerged };
        await db.updateAssetFilePath(currentAssetId, `text://${JSON.stringify(updated)}`);
      } catch (err) { console.error('Failed to save caption text:', err); }
    }, 300);
  };

  const wordsDebounceTimerRef = useRef<number | null>(null);

  const handleWordChange = useCallback((index: number, field: 'start' | 'end', value: number) => {
    const currentClipId = selectedClip?.id;
    if (!currentClipId) return;
    setLocalWords(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      if (wordsDebounceTimerRef.current) window.clearTimeout(wordsDebounceTimerRef.current);
      wordsDebounceTimerRef.current = window.setTimeout(async () => {
        try { await db.updateCaptionWords(currentClipId, next); }
        catch (err) { console.error('Failed to save word timing:', err); }
      }, 400);
      return next;
    });
  }, [selectedClip?.id]);

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

        // Sort words within each chunk by start time to ensure correct highlight order
        for (const chunk of parsed.chunks) {
          if (chunk.words && Array.isArray(chunk.words)) {
            chunk.words.sort((a: any, b: any) => a.start - b.start);
          }
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
        const addedStarts = new Set<number>();

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

          // Safety deduplication check
          const roundedStart = Math.round(timelineStart * 1000) / 1000;
          if (addedStarts.has(roundedStart)) continue;
          addedStarts.add(roundedStart);

          // Keep word timestamps absolute — TextClip compares assetSeconds (= chunkData.start + localTime)
          // against wordObj.start / wordObj.end which are also absolute.
          // TODO: pass clip start_time offset to whisper-ctranslate2 via --offset flag 
          // so word timestamps are relative to the full file correctly.
          const chunkToSave = { 
            ...chunk, 
            start: clampedStart, 
            end: clampedEnd,
            words: (chunk.words || []).map((w: any) => ({
              ...w,
              start: w.start, // Absolute file time from Whisper
              end: w.end,
            }))
          };

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

  const handleExportSrt = async () => {
    try {
      const projectId = selectedClip?.project_id || 1;
      const srt = await db.exportCaptionsSrt(projectId);
      if (!srt || srt.trim().length === 0) {
        alert('No captions found. Generate captions first using the Captions button.');
        return;
      }
      const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `captions_${Date.now()}.srt`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert(`SRT export failed: ${String(err)}`);
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
        <div className="prop-empty" style={{ flexDirection: 'column', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ 
            fontSize: '48px', 
            marginBottom: '16px', 
            opacity: 0.5,
            filter: 'grayscale(1) brightness(1.5)'
          }}>
            🎯
          </div>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ac-text-primary)', marginBottom: '8px' }}>
            Nothing Selected
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ac-text-muted)', lineHeight: '1.6', maxWidth: '200px', marginBottom: '24px' }}>
            Select a clip on the timeline to adjust its properties and style.
          </div>
          
          <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, var(--ac-border-subtle), transparent)', marginBottom: '24px' }} />
          
          <button 
            className="prop-ai-btn" 
            style={{ 
              width: '100%', 
              height: '40px',
              background: 'linear-gradient(135deg, #7c5cfc 0%, #5b3fd1 100%)',
              boxShadow: '0 4px 12px rgba(124, 92, 252, 0.3)',
              border: 'none',
              borderRadius: '8px'
            }}
            onClick={handleManualCaption}
          >
            <span style={{ fontSize: '14px', marginRight: '6px' }}>+</span>
            Add Manual Caption
          </button>
        </div>
      ) : (
        <>
          {/* ── Header ────────────────────────────────────── */}
          <div className="prop-header">
            <div className="prop-header-label">Inspector</div>
            {selectedClip.track_type === 'text' ? (
              /* CapCut-style caption preview strip */
              <div
                style={{
                  background: 'linear-gradient(135deg, #1a1040 0%, #0d0d1a 100%)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  minHeight: '64px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  margin: '4px 0',
                  border: '1px solid var(--ac-border)',
                }}
              >
                {/* Glow bg if glow is set */}
                {localCaptionStyle.glowSize > 0 && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(ellipse at center, ${localCaptionStyle.glowColor}22 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                )}
                <span
                  style={{
                    fontFamily: `"${localCaptionStyle.fontFamily}", "Inter", "Segoe UI", Roboto, Arial, sans-serif`,
                    fontSize: `${Math.min(localCaptionStyle.fontSize * 0.25, 28)}px`,
                    fontWeight: localCaptionStyle.bold ? 700 : 400,
                    fontStyle: localCaptionStyle.italic ? 'italic' : 'normal',
                    textTransform: localCaptionStyle.uppercase ? 'uppercase' : 'none',
                    color: localCaptionStyle.highlightColor,
                    WebkitTextStroke: localCaptionStyle.strokeWidth > 0
                      ? `${Math.max(0.5, localCaptionStyle.strokeWidth * 0.3)}px ${localCaptionStyle.strokeColor}`
                      : 'none',
                    textShadow: localCaptionStyle.glowSize > 0
                      ? `0 0 ${localCaptionStyle.glowSize}px ${localCaptionStyle.glowColor}, 0 0 ${localCaptionStyle.glowSize * 2}px ${localCaptionStyle.glowColor}`
                      : localCaptionStyle.shadowBlur > 0
                        ? `${localCaptionStyle.shadowX * 0.3}px ${localCaptionStyle.shadowY * 0.3}px ${localCaptionStyle.shadowBlur}px rgba(0,0,0,0.9)`
                        : '0 2px 8px rgba(0,0,0,0.8)',
                    letterSpacing: `${localCaptionStyle.letterSpacing}px`,
                    lineHeight: localCaptionStyle.lineHeight,
                    textAlign: 'center',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {localText || 'Caption Preview'}
                </span>
              </div>
            ) : (
              <div className="prop-header-title" title={selectedClip.file_path}>
                {selectedClip.file_path?.split(/[/\\]/).pop() || 'Untitled Clip'}
              </div>
            )}
          </div>

          {/* ── Content area (scrollable) ─────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            
            {selectedClip.track_type === 'text' && (
              <div className="prop-section">
                <div className="prop-section-header">Edit Caption</div>
                <textarea
                  className="prop-textarea"
                  value={localText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    background: 'var(--ac-bg-overlay)',
                    border: '1px solid var(--ac-border)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: 'var(--ac-text)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
              </div>
            )}
            
            {/* ── Transform ───────────────────────────────── */}
            <div className="prop-section">
              <div className="prop-section-header">Transform</div>
              
              <div className="prop-slider-row">
                <div className="prop-slider-label">Scale</div>
                <div className="prop-slider-container">
                  <input type="range" min="10" max="200" value={clipScale} className="prop-range"
                    onChange={e => {
                      const val = Number(e.target.value);
                      setClipScale(val);
                      if (scaleDebounceRef.current) window.clearTimeout(scaleDebounceRef.current);
                      scaleDebounceRef.current = window.setTimeout(() => {
                        if (selectedClip) db.updateClipScale(selectedClip.id, val / 100).then(onTimelineChange).catch(console.error);
                      }, 300);
                    }} />
                </div>
                <div className="prop-slider-value">{clipScale}%</div>
              </div>

              <div className="prop-slider-row">
                <div className="prop-slider-label">Volume</div>
                <div className="prop-slider-container">
                  <input type="range" min="0" max="200" value={localVolume * 100} className="prop-range"
                    onChange={e => {
                      const vol = parseFloat(e.target.value) / 100;
                      setLocalVolume(vol);
                      if (volumeDebounceRef.current) window.clearTimeout(volumeDebounceRef.current);
                      volumeDebounceRef.current = window.setTimeout(() => {
                        if (selectedClip) db.setAudioVolume(selectedClip.id, vol).then(onTimelineChange).catch(console.error);
                      }, 300);
                    }} />
                </div>
                <div className="prop-slider-value">{Math.round(localVolume * 100)}%</div>
              </div>
            </div>

            {/* ── Caption Style Editor ─────── */}
            {(selectedClip.track_type === 'text' || selectedClip.ai_metadata?.['captions']?.status === 'completed' || !!selectedClip.ai_metadata?.['captions']?.json_data) && (
              <div className="prop-section">
                <div className="prop-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Caption Style</span>
                  <button className="prop-apply-all-btn" onClick={handleApplyToAll}>
                    Apply to All
                  </button>
                </div>
                <CaptionStyleEditor
                  clipId={String(selectedClip.id)}
                  currentStyle={localCaptionStyle}
                  onChange={handleCaptionStyleChange}
                />
              </div>
            )}

            {/* ── Words Editor ──────────────────────────────── */}
            {selectedClip.track_type === 'text' && localWords.length > 0 && (
              <div className="prop-section">
                <div className="prop-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Word Timing</span>
                  <span style={{ fontSize: '9px', color: 'var(--ac-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    click word to edit
                  </span>
                </div>
                {/* Mini timeline: each word as a colored pill proportional to duration */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--ac-border)',
                  marginBottom: '8px',
                }}>
                  {localWords.map((w, idx) => {
                    const dur = w.end - w.start;
                    const totalDur = localWords.reduce((acc, word, i) => {
                      const wordDur = word.end - word.start;
                      const gap = i < localWords.length - 1 ? Math.max(0, localWords[i + 1].start - word.end) : 0;
                      return acc + wordDur + gap;
                    }, 0) || 1;
                    const widthPct = Math.max(5, (dur / totalDur) * 100);
                    return (
                      <div
                        key={`pill-${idx}-${w.word}`}
                        title={`${w.word}: ${w.start.toFixed(2)}s → ${w.end.toFixed(2)}s`}
                        style={{
                          width: `${widthPct}%`,
                          minWidth: '24px',
                          background: 'var(--ac-accent-dim)',
                          border: '1px solid var(--ac-accent)',
                          borderRadius: '4px',
                          padding: '3px 5px',
                          fontSize: '10px',
                          color: 'var(--ac-accent-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                      >
                        {w.word}
                      </div>
                    );
                  })}
                </div>
                {/* Editable rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {localWords.map((w, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 24px', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={w.word}
                        onChange={e => {
                          const next = [...localWords];
                          next[idx] = { ...next[idx], word: e.target.value };
                          setLocalWords(next);
                        }}
                        onBlur={() => handleWordChange(idx, 'start', localWords[idx].start)}
                        style={{
                          fontSize: '11px', padding: '3px 6px',
                          background: 'var(--ac-bg-elevated)',
                          border: '1px solid var(--ac-border)',
                          color: 'var(--ac-text-primary)',
                          borderRadius: '4px',
                          outline: 'none',
                          width: '100%',
                        }}
                      />
                      <input
                        type="number" step="0.01"
                        value={w.start.toFixed(2)}
                        onChange={e => handleWordChange(idx, 'start', parseFloat(e.target.value))}
                        style={{ fontSize: '10px', padding: '3px 4px', background: 'var(--ac-bg-elevated)', border: '1px solid var(--ac-border)', color: 'var(--ac-text-muted)', borderRadius: '4px', width: '100%' }}
                      />
                      <input
                        type="number" step="0.01"
                        value={w.end.toFixed(2)}
                        onChange={e => handleWordChange(idx, 'end', parseFloat(e.target.value))}
                        style={{ fontSize: '10px', padding: '3px 4px', background: 'var(--ac-bg-elevated)', border: '1px solid var(--ac-border)', color: 'var(--ac-text-muted)', borderRadius: '4px', width: '100%' }}
                      />
                      <button
                        onClick={() => {
                          const next = localWords.filter((_, i) => i !== idx);
                          setLocalWords(next);
                          if (selectedClip?.id) db.updateCaptionWords(selectedClip.id, next).catch(console.error);
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--ac-text-muted)', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                        title="Delete word"
                      >×</button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const last = localWords[localWords.length - 1];
                    const newWord = { word: 'word', start: last?.end ?? 0, end: (last?.end ?? 0) + 0.5 };
                    const next = [...localWords, newWord];
                    setLocalWords(next);
                    if (selectedClip?.id) db.updateCaptionWords(selectedClip.id, next).catch(console.error);
                  }}
                  style={{
                    marginTop: '8px', width: '100%', padding: '5px', fontSize: '11px',
                    background: 'transparent', border: '1px dashed var(--ac-border)',
                    color: 'var(--ac-text-muted)', borderRadius: '4px', cursor: 'pointer',
                  }}
                >+ Add Word</button>
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
                <button
                  className="prop-ai-btn"
                  onClick={handleExportSrt}
                  title="Export captions as .srt file"
                >
                  <div className="prop-dot" style={{ background: '#3b82f6' }} />
                  SRT
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
