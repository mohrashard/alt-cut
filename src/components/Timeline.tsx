import { useDroppable } from '@dnd-kit/core';
import type { TimelineClip } from '../lib/db';

interface TimelineProps {
  clips: TimelineClip[];
  videoDuration: number;
  selectedClipId: number | null;
  onClipSelected: (id: number | null) => void;
  onTimelineChange: () => void;
}

const ScissorIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
    <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
    <line x1="8.12" y1="8.12" x2="12" y2="12"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

export function Timeline({ clips, videoDuration, selectedClipId, onClipSelected, onTimelineChange }: TimelineProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'timeline-droppable' });

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const totalDur = videoDuration > 0 ? videoDuration : 10;

  return (
    <div className="timeline-section">
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="timeline-tools-left">
          <button className="tl-btn" title="Undo">↩</button>
          <button className="tl-btn" title="Redo">↪</button>
          <div style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
          <button
            className="tl-btn tl-btn-text"
            disabled={selectedClipId === null}
            title="Split at playhead"
          >
            <ScissorIcon /> Split
          </button>
          <button
            className="tl-btn tl-btn-text"
            disabled={selectedClipId === null}
            title="Delete selected"
            onClick={async () => {
              if (selectedClipId !== null) {
                const db = await import('../lib/db');
                await db.deleteTimelineClip(selectedClipId);
                onClipSelected(null);
                onTimelineChange();
              }
            }}
          >
            <TrashIcon /> Delete
          </button>
        </div>

        <div className="timeline-tools-right">
          <span>{formatTime(0)} / {formatTime(videoDuration)}</span>
        </div>
      </div>

      {/* Timeline body */}
      <div className="timeline-body">
        {/* Track Labels Column */}
        <div className="timeline-track-labels">
          <div className="track-label text-track">TEXT</div>
          <div className="track-label video-track" style={{ color: '#3b82f6' }}>VIDEO</div>
          <div className="track-label audio-track" style={{ color: '#10b981' }}>AUDIO</div>
        </div>

        {/* Tracks */}
        <div className="timeline-tracks">
          {/* Ruler */}
          <div className="timeline-ruler">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i}>{formatTime(i * 5)}</span>
            ))}
          </div>

          {/* Text track */}
          <div className="track-row text-track">
            <div className="track-drop-zone" style={{ background: 'rgba(255,255,255,0.015)' }} />
          </div>

          {/* Video track (droppable) */}
          <div className="track-row video-track">
            <div
              ref={setNodeRef}
              className={`track-drop-zone ${isOver ? 'is-over' : ''}`}
              style={{ background: clips.length === 0 ? 'rgba(59,130,246,0.04)' : 'transparent' }}
            >
              {clips.length === 0 && (
                <div className="empty-timeline-hint">
                  <span>📦</span>
                  <span>Drag material here and start to create</span>
                </div>
              )}
              {clips.map(clip => {
                const dur = clip.end_time - clip.start_time;
                const widthPct = (dur / totalDur) * 100;
                const leftPct = (clip.timeline_start / totalDur) * 100;
                const isProcessing =
                  clip.ai_metadata?.['captions']?.status === 'processing' ||
                  clip.ai_metadata?.['denoise']?.status === 'processing';

                return (
                  <div
                    key={clip.id}
                    className={`clip-block video ${selectedClipId === clip.id ? 'selected' : ''}`}
                    style={{ width: `${widthPct}%`, left: `${leftPct}%`, position: 'absolute' }}
                    onClick={() => onClipSelected(selectedClipId === clip.id ? null : clip.id)}
                    title={clip.file_path}
                  >
                    {isProcessing && <span className="spin" style={{ marginRight: 4 }}>⚙️</span>}
                    {clip.file_path?.split(/[/\\]/).pop()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audio track */}
          <div className="track-row audio-track">
            <div className="track-drop-zone" style={{ background: 'rgba(16,185,129,0.03)', position: 'relative' }}>
              {clips.map(clip => {
                const dur = clip.end_time - clip.start_time;
                const widthPct = (dur / totalDur) * 100;
                const leftPct = (clip.timeline_start / totalDur) * 100;
                return (
                  <div
                    key={clip.id}
                    className="clip-block audio"
                    style={{
                      width: `${widthPct}%`,
                      left: `${leftPct}%`,
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: '22px',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
