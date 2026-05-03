import React from 'react';

export interface TransitionsSidebarProps {
  selectedClipId: string | null;
  activeTransition?: string | null;
  onApply: (transitionType: string) => void;
}

const TRANSITIONS = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'slide', label: 'Slide' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'ink', label: 'Ink' },
  { id: 'shutter', label: 'Shutter' },
];

export const TransitionsSidebar: React.FC<TransitionsSidebarProps> = ({
  selectedClipId,
  activeTransition,
  onApply,
}) => {
  return (
    <div className="transitions-sidebar-container" style={{
      width: 'var(--sidebar-width, 260px)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--ac-bg-panel)',
      borderRight: '1px solid var(--ac-border)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--ac-border)',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--ac-text-primary)'
      }}>
        Transitions
      </div>

      {!selectedClipId ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'var(--ac-text-muted)',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          Select a clip on the timeline first
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          alignContent: 'start',
        }}>
          {TRANSITIONS.map((t) => {
            const isActive = activeTransition === t.id;
            return (
              <div
                key={t.id}
                onClick={() => onApply(t.id)}
                style={{
                  width: '100%',
                  background: 'var(--ac-bg-elevated)',
                  border: `1px solid ${isActive ? 'var(--ac-accent)' : 'var(--ac-border-subtle)'}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                cursor: selectedClipId ? 'pointer' : 'default',
                opacity: selectedClipId ? 1 : 0.6,
                overflow: 'hidden',
              }}
              className={`transition-card transition-card-${t.id}`}
            >
              <div style={{
                width: '100%',
                aspectRatio: '16/9',
                background: '#1a1a1a',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {t.id === 'none' ? (
                  <span style={{ color: 'var(--ac-text-muted)', fontSize: '16px' }}>—</span>
                ) : (
                  <>
                    <div className="tr-preview-a" />
                    <div className={`tr-preview-b tr-anim-${t.id}`} />
                  </>
                )}
              </div>
              <div style={{
                padding: '6px',
                textAlign: 'center',
                fontSize: '11px',
                color: isActive ? 'var(--ac-accent-text)' : 'var(--ac-text-secondary)',
                borderTop: `1px solid ${isActive ? 'var(--ac-accent)' : 'var(--ac-border-subtle)'}`,
                background: isActive ? 'var(--ac-accent-dim)' : 'transparent',
                transition: 'background 0.2s, color 0.2s',
              }}>
                {t.label}
              </div>
            </div>
          );
        })}
        </div>
      )}

      <style>{`
        .transition-card {
          transition: border-color 0.2s, transform 0.2s;
        }
        .transition-card:hover {
          border-color: var(--ac-accent) !important;
          transform: translateY(-2px);
        }

        .tr-preview-a {
          position: absolute;
          inset: 0;
          background: #2a2a30;
        }
        
        .tr-preview-b {
          position: absolute;
          inset: 0;
          background: var(--ac-accent);
          opacity: 0;
        }

        /* Fade */
        .transition-card-fade:hover .tr-anim-fade {
          animation: tr-fade 1.5s infinite;
        }
        @keyframes tr-fade {
          0%, 15% { opacity: 0; }
          40%, 60% { opacity: 1; }
          85%, 100% { opacity: 0; }
        }

        /* Wipe */
        .tr-anim-wipe {
          transform: translateX(-100%);
          opacity: 1;
        }
        .transition-card-wipe:hover .tr-anim-wipe {
          animation: tr-wipe 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes tr-wipe {
          0%, 15% { transform: translateX(-100%); }
          40%, 60% { transform: translateX(0); }
          85%, 100% { transform: translateX(100%); }
        }

        /* Slide */
        .tr-anim-slide {
          transform: translateX(100%);
          opacity: 1;
        }
        .transition-card-slide:hover .tr-anim-slide {
          animation: tr-slide 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes tr-slide {
          0%, 15% { transform: translateX(100%); }
          40%, 60% { transform: translateX(0); }
          85%, 100% { transform: translateX(-100%); }
        }

        /* Zoom */
        .tr-anim-zoom {
          transform: scale(0.5);
          opacity: 0;
        }
        .transition-card-zoom:hover .tr-anim-zoom {
          animation: tr-zoom 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes tr-zoom {
          0%, 15% { transform: scale(0.5); opacity: 0; }
          40%, 60% { transform: scale(1); opacity: 1; }
          85%, 100% { transform: scale(1.5); opacity: 0; }
        }

        /* Ink */
        .tr-anim-ink {
          clip-path: circle(0% at center);
          opacity: 1;
        }
        .transition-card-ink:hover .tr-anim-ink {
          animation: tr-ink 1.5s ease-in-out infinite;
        }
        @keyframes tr-ink {
          0%, 15% { clip-path: circle(0% at center); }
          40%, 60% { clip-path: circle(150% at center); }
          85%, 100% { clip-path: circle(0% at center); }
        }

        /* Shutter */
        .tr-anim-shutter {
          transform: scaleY(0);
          transform-origin: center;
          opacity: 1;
        }
        .transition-card-shutter:hover .tr-anim-shutter {
          animation: tr-shutter 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes tr-shutter {
          0%, 15% { transform: scaleY(0); }
          40%, 60% { transform: scaleY(1); }
          85%, 100% { transform: scaleY(0); }
        }
      `}</style>
    </div>
  );
};
