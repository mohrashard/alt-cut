import { useState } from 'react';

interface TopNavProps {
  isRendering: boolean;
  onExport: () => void;
  onClearTimeline?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function TopNav({
  isRendering,
  onExport,
  onClearTimeline,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TopNavProps) {
  const [projectName, setProjectName] = useState('Untitled Project');

  return (
    <div className="ac-topnav">

      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="ac-topnav-logo">
        <div className="ac-logo-mark">A</div>
        <span className="ac-logo-text">AltCut</span>
      </div>

      {/* ── Divider ─────────────────────────────────────── */}
      <div className="ac-topnav-divider" />

      {/* ── Menu buttons: File · Edit · View ────────────── */}
      <div className="ac-topnav-menu">
        <button className="ac-menu-btn">File</button>

        {/* Edit group: Undo + Redo */}
        <button
          className="ac-menu-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          Edit
        </button>

        {/* View group: Clear timeline */}
        <button
          className="ac-menu-btn"
          onClick={onClearTimeline}
          title="Clear Timeline"
        >
          View
        </button>

        {/* Undo / Redo as small icon-buttons right after the text group */}
        <div className="ac-topnav-divider" style={{ margin: '0 4px' }} />

        <button
          className="ac-icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </button>
        <button
          className="ac-icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↪
        </button>
        <button
          className="ac-icon-btn"
          onClick={onClearTimeline}
          title="Clear Timeline"
        >
          🗑
        </button>
      </div>

      {/* ── Divider ─────────────────────────────────────── */}
      <div className="ac-topnav-divider" />

      {/* ── Editable project name ────────────────────────── */}
      <input
        className="ac-project-name"
        value={projectName}
        onChange={e => setProjectName(e.target.value)}
        spellCheck={false}
        aria-label="Project name"
      />

      {/* ── Spacer ──────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Resolution badge ────────────────────────────── */}
      <span className="ac-res-badge">1080×1920 · 30fps</span>

      {/* ── Export button ───────────────────────────────── */}
      <button
        className="ac-export-btn"
        onClick={onExport}
        disabled={isRendering}
        title="Export"
      >
        {isRendering ? (
          <><span className="spin">⚙</span> Rendering…</>
        ) : (
          <>↑ Export</>
        )}
      </button>

    </div>
  );
}
