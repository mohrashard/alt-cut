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
  onToggleAudio, onZoomFit, onZoomOut, onZoomIn, onZoomSlider,
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
          background: #1a1a1f;
          border-bottom: 1px solid rgba(255,255,255,0.07);
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
          background: rgba(255,255,255,0.1);
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
          border: none;
          border-radius: 5px;
          background: transparent;
          color: #a0a0b0;
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
          background: rgba(255,255,255,0.08);
          color: #e8e8f0;
        }
        .tl-b:active:not(:disabled) {
          background: rgba(255,255,255,0.12);
          transform: scale(0.93);
        }
        .tl-b:disabled {
          opacity: 0.28;
          cursor: default;
        }

        /* Active / toggled state */
        .tl-b.is-on {
          background: rgba(99, 179, 237, 0.14);
          color: #63b3ed;
        }
        .tl-b.is-on:hover:not(:disabled) {
          background: rgba(99, 179, 237, 0.22);
          color: #90cdf4;
        }

        /* Accent buttons (split, marker) */
        .tl-b.accent-split {
          color: #f6ad55;
        }
        .tl-b.accent-split:hover:not(:disabled) {
          background: rgba(246,173,85,0.12);
          color: #fbd38d;
        }
        .tl-b.accent-marker {
          color: #fc8181;
        }
        .tl-b.accent-marker:hover:not(:disabled) {
          background: rgba(252,129,129,0.12);
          color: #feb2b2;
        }

        /* Add button — slightly wider */
        .tl-b.tl-b-add {
          width: 32px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #c0c0d0;
        }
        .tl-b.tl-b-add:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.18);
          color: #e8e8f0;
        }

        /* Select tool — shows as "pressed" */
        .tl-b.tl-b-select {
          background: rgba(255,255,255,0.07);
          color: #e8e8f0;
          border: 1px solid rgba(255,255,255,0.12);
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
          color: #e8e8f0;
          background: #2d2d3a;
          border: 1px solid rgba(255,255,255,0.1);
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
          background: rgba(255,255,255,0.15);
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
          background: #63b3ed;
          cursor: pointer;
          box-shadow: 0 0 0 2px rgba(99,179,237,0.25);
          transition: transform 0.1s, box-shadow 0.1s;
        }
        .tl-zoom-slider-pro:hover::-webkit-slider-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 0 4px rgba(99,179,237,0.2);
        }
        .tl-zoom-slider-pro::-moz-range-thumb {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: none;
          background: #63b3ed;
          cursor: pointer;
        }

        /* Timecode */
        .tl-timecode-pro {
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.03em;
          color: #c0c0d0;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 5px;
          padding: 3px 9px;
          min-width: 108px;
          text-align: center;
          cursor: default;
          flex-shrink: 0;
        }
        .tl-timecode-pro .tc-current {
          color: #e8e8f0;
        }
        .tl-timecode-pro .tc-sep {
          color: rgba(255,255,255,0.25);
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