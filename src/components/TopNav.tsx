interface TopNavProps {
  isRendering: boolean;
  onExport: () => void;
  onClearTimeline?: () => void;
}

const WindowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18"/>
  </svg>
);
const ShareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);
const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

export function TopNav({ isRendering, onExport, onClearTimeline }: TopNavProps) {
  return (
    <div className="topnav">
      <div className="topnav-left">
        <div className="topnav-logo">
          <div className="topnav-logo-icon">AC</div>
          <span>AltCut</span>
        </div>
        <div className="topnav-menu">
          <button className="menu-btn">Menu ▾</button>
        </div>
        {onClearTimeline && (
          <button className="btn-icon btn-icon-ghost" onClick={onClearTimeline}>
            <TrashIcon />
            Clear
          </button>
        )}
        <div className="topnav-title">Untitled Project</div>
      </div>

      <div className="topnav-right">
        <button className="btn-icon btn-icon-ghost">
          <WindowIcon />
          <span>Window</span>
        </button>
        <button className="btn-icon btn-icon-pro">
          ✦ Pro
        </button>
        <button className="btn-icon btn-icon-share">
          <ShareIcon />
          Share
        </button>
        <button
          className="btn-icon btn-icon-export"
          onClick={onExport}
          disabled={isRendering}
        >
          {isRendering ? (
            <><span className="spin">⚙</span> Rendering…</>
          ) : (
            <><UploadIcon /> Export</>
          )}
        </button>
      </div>
    </div>
  );
}
