import { fmt, zoomToSlider, sliderToZoom } from './utils';
import {
  AddIcon, SelectIcon, UndoIcon, RedoIcon, SplitIcon,
  DeleteLeftIcon, DeleteRightIcon, TrashIcon, MarkerIcon,
  ZoomInIcon, ZoomOutIcon, ZoomFitIcon, MagnetIcon,
} from './icons';

interface TimelineToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  selectedClipId: number | null;
  magnetOn: boolean;
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
  onZoomFit: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomSlider: (value: number) => void;
}

export function TimelineToolbar({
  canUndo, canRedo, canSplit, selectedClipId, magnetOn, pps,
  playheadSeconds, videoDuration, timecodeDomRef,
  onUndo, onRedo, onSplit, onDeleteLeft, onDeleteRight, onDelete,
  onAddMarker, onToggleMagnet, onZoomFit, onZoomOut, onZoomIn, onZoomSlider,
}: TimelineToolbarProps) {
  return (
    <div className="timeline-toolbar">
      <div className="timeline-tools-left">
        <button className="tl-btn tl-btn-add" title="Add media"><AddIcon /></button>
        <button className="tl-btn tl-btn-active" title="Selection tool"><SelectIcon /></button>
        <div className="tl-divider" />
        <button className="tl-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><UndoIcon /></button>
        <button className="tl-btn" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><RedoIcon /></button>
        <div className="tl-divider" />
        <button className="tl-btn" title="Split at playhead (S)" disabled={!canSplit} onClick={onSplit}><SplitIcon /></button>
        <button className="tl-btn" title="Delete left part (Q)" disabled={selectedClipId === null} onClick={onDeleteLeft}><DeleteLeftIcon /></button>
        <button className="tl-btn" title="Delete right part (W)" disabled={selectedClipId === null} onClick={onDeleteRight}><DeleteRightIcon /></button>
        <button className="tl-btn" title="Delete selected (Delete)" disabled={selectedClipId === null} onClick={onDelete}><TrashIcon /></button>
        <div className="tl-divider" />
        <button className="tl-btn tl-btn-marker" title="Add marker (M)" onClick={onAddMarker}><MarkerIcon /></button>
      </div>

      <div className="timeline-tools-right">
        <button className={`tl-btn ${magnetOn ? 'tl-btn-active' : ''}`} title="Toggle snapping" onClick={onToggleMagnet}>
          <MagnetIcon active={magnetOn} />
        </button>
        <div className="tl-divider" />
        <button className="tl-btn" title="Zoom to fit" onClick={onZoomFit}><ZoomFitIcon /></button>
        <button className="tl-btn" title="Zoom out (-)" onClick={onZoomOut}><ZoomOutIcon /></button>
        <input type="range" min="0" max="1" step="0.001" value={zoomToSlider(pps)}
          onChange={e => onZoomSlider(sliderToZoom(Number(e.target.value)))} className="tl-zoom-slider" title="Zoom" />
        <button className="tl-btn" title="Zoom in (+)" onClick={onZoomIn}><ZoomInIcon /></button>
        <div className="tl-divider" />
        <span className="tl-timecode" ref={timecodeDomRef as React.RefObject<HTMLSpanElement>}>{fmt(playheadSeconds)} / {fmt(videoDuration)}</span>
      </div>
    </div>
  );
}
