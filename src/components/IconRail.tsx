interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// ─── SVG Icons ────────────────────────────────────────────────

const IconMedia = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const IconAudio = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>
);

const IconText = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
);

const IconEffects = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const IconTransitions = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3l14 9-14 9V3z" opacity="0.5"/><path d="M19 3v18"/>
  </svg>
);

const IconTemplates = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="12" width="8" height="9" rx="1"/><rect x="15" y="12" width="6" height="9" rx="1"/>
  </svg>
);

const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>
);

// ─── Rail items config ─────────────────────────────────────────

const TOP_ITEMS = [
  { id: 'media',       label: 'Media',       Icon: IconMedia },
  { id: 'audio',       label: 'Audio',       Icon: IconAudio },
  { id: 'text',        label: 'Text',        Icon: IconText  },
] as const;

const MID_ITEMS = [
  { id: 'effects',     label: 'Effects',     Icon: IconEffects     },
  { id: 'transitions', label: 'Transitions', Icon: IconTransitions  },
  { id: 'templates',   label: 'Templates',   Icon: IconTemplates    },
] as const;

// ─── Component ────────────────────────────────────────────────

export function IconRail({ activeTab, onTabChange }: IconRailProps) {
  return (
    <div className="icon-rail">

      {/* Top group */}
      <div className="icon-rail-group">
        {TOP_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`icon-rail-btn${activeTab === id ? ' icon-rail-btn--active' : ''}`}
            title={label}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-pressed={activeTab === id}
          >
            <Icon />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="icon-rail-sep" />

      {/* Mid group */}
      <div className="icon-rail-group">
        {MID_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`icon-rail-btn${activeTab === id ? ' icon-rail-btn--active' : ''}`}
            title={label}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-pressed={activeTab === id}
          >
            <Icon />
          </button>
        ))}
      </div>

      {/* Spacer pushes settings to bottom */}
      <div style={{ flex: 1 }} />

      {/* Bottom separator */}
      <div className="icon-rail-sep" />

      {/* Settings */}
      <div className="icon-rail-group">
        <button
          className={`icon-rail-btn${activeTab === 'settings' ? ' icon-rail-btn--active' : ''}`}
          title="Settings"
          onClick={() => onTabChange('settings')}
          aria-label="Settings"
          aria-pressed={activeTab === 'settings'}
        >
          <IconSettings />
        </button>
      </div>

    </div>
  );
}
