import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineClip } from '../../lib/db';

// ─── Module-level clipboard (survives re-renders, no state needed) ──────────
export let clipboardClips: TimelineClip[] = [];
export function setClipboard(clips: TimelineClip[]) { clipboardClips = clips; }

// ─── Icons ────────────────────────────────────────────────────
const IcoExtract   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
const IcoMute      = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>;
const IcoUnmute    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>;
const IcoDuplicate = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const IcoDelete    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IcoSplit     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2"/><polyline points="8,6 12,2 16,6"/></svg>;
const IcoEye       = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoEyeOff    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IcoCopy      = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const IcoPaste     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>;
const IcoReveal    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
const IcoReplace   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>;

// ─── Types ────────────────────────────────────────────────────
interface ClipContextMenuProps {
  contextMenu: { x: number; y: number; clipId: number } | null;
  setContextMenu: (v: null) => void;
  clips: TimelineClip[];
  selectedClipIds: number[];
  onClipSelected: (ids: number[]) => void;
  onExtractAudio: (clipId: number) => void;
  onToggleMute: (clipId: number, currentEnabled: number) => void;
  onToggleHidden: (clipId: number, currentHidden: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onRevealInMedia: (assetId: number) => void;
  onReplaceMedia: (clipId: number) => void;
  hasPasteContent: boolean;
}

interface MarkerContextMenuProps {
  markerCtxMenu: { x: number; y: number; markerId: number } | null;
  onDeleteMarker: (markerId: number) => void;
  onClose: () => void;
}

// ─── Helper ───────────────────────────────────────────────────
function CtxItem({
  icon, label, shortcut, danger = false, disabled = false, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`ctx-item ${danger ? 'ctx-item-danger' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e as any);
      }}
      disabled={disabled}
    >
      <span className="ctx-item-icon">{icon}</span>
      <span className="ctx-item-label">{label}</span>
      {shortcut && <span className="ctx-item-shortcut">{shortcut}</span>}
    </button>
  );
}

function CtxSeparator() {
  return <div className="ctx-separator" />;
}

// ─── Clip context menu ─────────────────────────────────────────
export function ClipContextMenu({
  contextMenu, clips, selectedClipIds,
  onExtractAudio, onToggleMute, onToggleHidden, onDuplicate, onDelete, onSplit,
  onCopy, onPaste, onRevealInMedia, onReplaceMedia, hasPasteContent,
}: ClipContextMenuProps) {
  if (!contextMenu) return null;
  const clip = clips.find(c => c.id === contextMenu.clipId);
  if (!clip) return null;

  const isVideo   = clip.track_type === 'video';
  const isMuted   = clip.audio_enabled === 0;
  const isHidden  = clip.hidden === 1;

  const count = selectedClipIds.length;
  const isMulti = count > 1;

  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (contextMenu && menuRef.current) {
      menuRef.current.style.top = `${contextMenu.y}px`;
      menuRef.current.style.left = `${contextMenu.x}px`;
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        menuRef.current.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
      if (rect.right > window.innerWidth) {
        menuRef.current.style.left = `${window.innerWidth - rect.width - 10}px`;
      }
    }
  }, [contextMenu]);

  return createPortal(
    <div ref={menuRef} className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x, visibility: 'visible' }}>
      {/* ── Edit actions ── */}
      <CtxItem icon={<IcoCopy />}  label={isMulti ? `Copy ${count} clips` : 'Copy'} shortcut="Ctrl+C"
        onClick={e => { e.stopPropagation(); onCopy(); }} />
      <CtxItem icon={<IcoPaste />} label="Paste at playhead" shortcut="Ctrl+V" disabled={!hasPasteContent}
        onClick={e => { e.stopPropagation(); onPaste(); }} />

      <CtxSeparator />

      {/* ── Clip actions ── */}
      <CtxItem icon={<IcoSplit />}     label={isMulti ? `Split ${count} clips` : 'Split at playhead'} shortcut="S"
        onClick={e => { e.stopPropagation(); onSplit(); }} />
      <CtxItem icon={<IcoDuplicate />} label={isMulti ? `Duplicate ${count} clips` : 'Duplicate'}
        onClick={e => { e.stopPropagation(); onDuplicate(); }} />

      {!isMulti && <CtxSeparator />}
      {!isMulti && (
        <CtxItem icon={<IcoReveal />} label="Reveal in Media"
          onClick={e => { e.stopPropagation(); onRevealInMedia(clip.asset_id); }} />
      )}
      {!isMulti && (
        <CtxItem icon={<IcoReplace />} label="Replace Media…"
          onClick={e => { e.stopPropagation(); onReplaceMedia(clip.id); }} />
      )}

      {!isMulti && isVideo && <CtxSeparator />}
      {!isMulti && isVideo && (
        <CtxItem
          icon={isMuted ? <IcoUnmute /> : <IcoMute />}
          label={isMuted ? 'Unmute audio' : 'Mute audio'}
          onClick={e => { e.stopPropagation(); onToggleMute(clip.id, clip.audio_enabled ?? 1); }}
        />
      )}
      {!isMulti && isVideo && (
        <CtxItem icon={<IcoExtract />} label="Extract audio"
          onClick={e => { e.stopPropagation(); onExtractAudio(clip.id); }} />
      )}
      {!isMulti && (
        <CtxItem
          icon={isHidden ? <IcoEye /> : <IcoEyeOff />}
          label={isHidden ? 'Show clip' : 'Hide clip'}
          onClick={e => { e.stopPropagation(); onToggleHidden(clip.id, clip.hidden ?? 0); }}
        />
      )}

      <CtxSeparator />
      <CtxItem icon={<IcoDelete />} label={isMulti ? `Delete ${count} clips` : 'Delete'} shortcut="Del" danger
        onClick={e => { e.stopPropagation(); onDelete(); }} />
    </div>,
    document.body
  );
}

// ─── Marker context menu ───────────────────────────────────────
export function MarkerContextMenu({ markerCtxMenu, onDeleteMarker, onClose }: MarkerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (markerCtxMenu && menuRef.current) {
      menuRef.current.style.top = `${markerCtxMenu.y}px`;
      menuRef.current.style.left = `${markerCtxMenu.x}px`;
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        menuRef.current.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
      if (rect.right > window.innerWidth) {
        menuRef.current.style.left = `${window.innerWidth - rect.width - 10}px`;
      }
    }
  }, [markerCtxMenu]);

  if (!markerCtxMenu) return null;
  return createPortal(
    <div ref={menuRef} className="context-menu" style={{ top: markerCtxMenu.y, left: markerCtxMenu.x }}
      onClick={onClose}>
      <CtxItem icon={<IcoDelete />} label="Delete marker" danger
        onClick={async e => { e.stopPropagation(); onDeleteMarker(markerCtxMenu.markerId); }} />
    </div>,
    document.body
  );
}
