import { fmt, zoomToSlider, sliderToZoom } from './utils';
import {
  AddIcon, SelectIcon, UndoIcon, RedoIcon, SplitIcon,
  DeleteLeftIcon, DeleteRightIcon, TrashIcon, MarkerIcon,
  ZoomInIcon, ZoomOutIcon, ZoomFitIcon, MagnetIcon,
  LinkIcon, UnlinkIcon, DuplicateIcon, RippleIcon,
} from './icons';

interface TimelineToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  selectedClipIds: number[];
  magnetOn: boolean;
  rippleEditingOn?: boolean;
  canDuplicate?: boolean;
  canToggleAudio?: boolean;
  isAudioSeparated?: boolean;
  pps: number;
  playheadSeconds: number;
  videoDuration: number;
  timecodeDomRef?: React.RefObject<HTMLSpanElement | null>;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDeleteLeft: () => void;
  onDeleteRight: () => void;
  onDelete: () => void;
  onAddMarker: () => void;
  onClearMarkers: () => void;
  onToggleMagnet: () => void;
  onToggleRippleEditing?: () => void;
  onDuplicate?: () => void;
  onToggleAudio?: () => void;
  onZoomFit: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomSlider: (value: number) => void;
}

export function TimelineToolbar({
  canUndo, canRedo, canSplit, selectedClipIds, magnetOn,
  rippleEditingOn = false, canDuplicate, canToggleAudio, isAudioSeparated,
  pps, playheadSeconds, videoDuration, timecodeDomRef,
  onUndo, onRedo, onSplit, onDeleteLeft, onDeleteRight, onDelete,
  onAddMarker, onToggleMagnet, onToggleRippleEditing, onDuplicate,
  onToggleAudio, onZoomFit, onZoomOut, onZoomIn, onZoomSlider, onClearMarkers,
}: TimelineToolbarProps) {
  const isRippleOn = !!rippleEditingOn;
  const hasSelection = selectedClipIds.length > 0;

  return (
    <>
      <style>{`
        .tl-toolbar-pro {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 36px;
          padding: 0 8px;
          background: var(--ac-bg-panel, #141416);
          border-bottom: 1px solid var(--ac-border, #1e1e22);
          gap: 2px;
          user-select: none;
          flex-shrink: 0;
        }

        .tl-group {
          display: flex;
          align-items: center;
          gap: 1px;
        }

        .tl-sep {
          width: 1px;
          height: 18px;
          background: var(--ac-border-subtle, #252529);
          margin: 0 5px;
          flex-shrink: 0;
        }

        .tl-spacer {
          flex: 1;
        }

        /* Base button */
        .tl-b {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 26px;
          border: 1px solid var(--ac-border-subtle, #252529);
          border-radius: 5px;
          background: var(--ac-bg-elevated, #1a1a1e);
          color: var(--ac-text-secondary, #888888);
          cursor: pointer;
          transition: background 0.12s, color 0.12s, opacity 0.12s;
          padding: 0;
          flex-shrink: 0;
        }
        .tl-b svg {
          width: 14px;
          height: 14px;
          display: block;
        }
        .tl-b:hover:not(:disabled) {
          background: var(--ac-border, #1e1e22);
          color: var(--ac-text-primary, #e2e2e8);
        }
        .tl-b:active:not(:disabled) {
          background: var(--ac-accent-dim, #1e1a2e);
          transform: scale(0.93);
        }
        .tl-b:disabled {
          opacity: 0.28;
          cursor: default;
        }

        /* Active / toggled state — purple accent */
        .tl-b.is-on {
          background: var(--ac-accent-dim, #1e1a2e);
          color: var(--ac-accent, #7c5cfc);
          border-color: rgba(124, 92, 252, 0.3);
        }
        .tl-b.is-on:hover:not(:disabled) {
          background: #261e40;
          color: var(--ac-accent-text, #a08dfc);
        }

        /* Accent buttons (split, marker) */
        .tl-b.accent-split {
          color: #f6ad55;
          border-color: rgba(246, 173, 85, 0.2);
        }
        .tl-b.accent-split:hover:not(:disabled) {
          background: rgba(246,173,85,0.1);
          color: #fbd38d;
        }
        .tl-b.accent-marker {
          color: #fc8181;
          border-color: rgba(252, 129, 129, 0.2);
        }
        .tl-b.accent-marker:hover:not(:disabled) {
          background: rgba(252,129,129,0.1);
          color: #feb2b2;
        }

        /* Add button — slightly wider */
        .tl-b.tl-b-add {
          width: 32px;
          background: var(--ac-bg-elevated, #1a1a1e);
          border: 1px solid var(--ac-border-subtle, #252529);
          color: var(--ac-text-secondary, #888888);
        }
        .tl-b.tl-b-add:hover {
          background: var(--ac-border, #1e1e22);
          border-color: var(--ac-border, #1e1e22);
          color: var(--ac-text-primary, #e2e2e8);
        }

        /* Select tool — shows as "pressed" */
        .tl-b.tl-b-select {
          background: var(--ac-accent-dim, #1e1a2e);
          color: var(--ac-accent, #7c5cfc);
          border: 1px solid rgba(124, 92, 252, 0.3);
        }

        /* Tooltip */
        .tl-b[title]:hover::after {
          content: attr(title);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 10px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: var(--ac-text-primary, #e2e2e8);
          background: var(--ac-bg-elevated, #1a1a1e);
          border: 1px solid var(--ac-border-subtle, #252529);
          border-radius: 4px;
          padding: 3px 7px;
          pointer-events: none;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }

        /* Zoom slider */
        .tl-zoom-slider-pro {
          -webkit-appearance: none;
          appearance: none;
          width: 72px;
          height: 3px;
          border-radius: 2px;
          background: var(--ac-border-subtle, #252529);
          outline: none;
          cursor: pointer;
          margin: 0 4px;
        }
        .tl-zoom-slider-pro::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: var(--ac-accent, #7c5cfc);
          cursor: pointer;
          box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.25);
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .tl-zoom-slider-pro:hover::-webkit-slider-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 0 4px rgba(124, 92, 252, 0.2);
        }
        .tl-zoom-slider-pro::-moz-range-thumb {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: none;
          background: var(--ac-accent, #7c5cfc);
          cursor: pointer;
        }

        /* Timecode */
        .tl-timecode-pro {
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.03em;
          color: var(--ac-text-muted, #555);
          background: var(--ac-bg-elevated, #1a1a1e);
          border: 1px solid var(--ac-border-subtle, #252529);
          border-radius: 5px;
          padding: 3px 9px;
          min-width: 108px;
          text-align: center;
          cursor: default;
          flex-shrink: 0;
        }
        .tl-timecode-pro .tc-current {
          color: var(--ac-text-primary, #e2e2e8);
        }
        .tl-timecode-pro .tc-sep {
          color: var(--ac-border, #1e1e22);
          margin: 0 2px;
        }
      `}</style>

      <div className="tl-toolbar-pro">

        {/* ── Left group: Add + Select ── */}
        <div className="tl-group">
          <button className="tl-b tl-b-add" title="Add media">
            <AddIcon />
          </button>
          <button className="tl-b tl-b-select" title="Selection tool (V)">
            <SelectIcon />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Undo / Redo ── */}
        <div className="tl-group">
          <button className="tl-b" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </button>
          <button className="tl-b" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Edit operations ── */}
        <div className="tl-group">
          <button
            className="tl-b accent-split"
            title="Split at playhead (S)"
            disabled={!canSplit}
            onClick={onSplit}
          >
            <SplitIcon />
          </button>

          <button
            className="tl-b"
            title={isAudioSeparated ? 'Link audio (L)' : 'Unlink audio (L)'}
            disabled={!canToggleAudio}
            onClick={onToggleAudio}
          >
            {isAudioSeparated ? <UnlinkIcon /> : <LinkIcon />}
          </button>

          <button
            className="tl-b"
            title="Duplicate clip (Ctrl+D)"
            disabled={!canDuplicate}
            onClick={onDuplicate}
          >
            <DuplicateIcon />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Delete operations ── */}
        <div className="tl-group">
          <button
            className="tl-b"
            title="Delete left of playhead (Q)"
            disabled={!hasSelection}
            onClick={onDeleteLeft}
          >
            <DeleteLeftIcon />
          </button>
          <button
            className="tl-b"
            title="Delete right of playhead (W)"
            disabled={!hasSelection}
            onClick={onDeleteRight}
          >
            <DeleteRightIcon />
          </button>
          <button
            className="tl-b"
            title="Delete selected (Del)"
            disabled={!hasSelection}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Marker ── */}
        <div className="tl-group">
          <button className="tl-b accent-marker" title="Add marker (M)" onClick={onAddMarker}>
            <MarkerIcon />
          </button>
          <button className="tl-b" title="Clear all markers" onClick={onClearMarkers} style={{ color: '#fc8181' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Spacer pushes right tools to far right ── */}
        <div className="tl-spacer" />

        {/* ── Right group: toggles ── */}
        <div className="tl-group">
          <button
            className={`tl-b${magnetOn ? ' is-on' : ''}`}
            title={magnetOn ? 'Snapping on — click to disable' : 'Snapping off — click to enable'}
            onClick={onToggleMagnet}
          >
            <MagnetIcon active={magnetOn} />
          </button>
          <button
            className={`tl-b${isRippleOn ? ' is-on' : ''}`}
            title={isRippleOn ? 'Ripple editing on — click to disable' : 'Ripple editing off — click to enable'}
            onClick={onToggleRippleEditing}
          >
            <RippleIcon active={isRippleOn} />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Zoom controls ── */}
        <div className="tl-group">
          <button className="tl-b" title="Zoom to fit (F)" onClick={onZoomFit}>
            <ZoomFitIcon />
          </button>
          <button className="tl-b" title="Zoom out (−)" onClick={onZoomOut}>
            <ZoomOutIcon />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={zoomToSlider(pps)}
            onChange={e => onZoomSlider(sliderToZoom(Number(e.target.value)))}
            className="tl-zoom-slider-pro"
            title="Zoom level"
          />
          <button className="tl-b" title="Zoom in (+)" onClick={onZoomIn}>
            <ZoomInIcon />
          </button>
        </div>

        <div className="tl-sep" />

        {/* ── Timecode ── */}
        <span
          className="tl-timecode-pro"
          ref={timecodeDomRef as React.RefObject<HTMLSpanElement>}
        >
          <span className="tc-current">{fmt(playheadSeconds)}</span>
          <span className="tc-sep">/</span>
          {fmt(videoDuration)}
        </span>

      </div>
    </>
  );
}