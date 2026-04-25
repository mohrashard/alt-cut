import { RULER_HEIGHT, TRACK_VIDEO_H, TRACK_AUDIO_H, TRACK_TEXT_H } from './constants';
import type { TrackState } from './constants';
import type { TimelineClip } from '../../lib/db';

interface TimelineTrackLabelsProps {
  textClips: TimelineClip[];
  trackStates: Record<string, TrackState>;
  openTrackMenu: string | null;
  setOpenTrackMenu: (t: string | null) => void;
  setTrackStates: (fn: (s: Record<string, TrackState>) => Record<string, TrackState>) => void;
}

export function TimelineTrackLabels({
  textClips,
  trackStates,
  openTrackMenu,
  setOpenTrackMenu,
  setTrackStates,
}: TimelineTrackLabelsProps) {
  return (
    <div className="timeline-track-labels" onClick={() => setOpenTrackMenu(null)}>
      <div className="tl-ruler-spacer" style={{ height: RULER_HEIGHT }} />
      {(['text','caption','video','audio'] as const).map(track => {
        const visible = track === 'text' ? textClips.length > 0 : true;
        if (!visible) return null;
        const h = track === 'video' ? TRACK_VIDEO_H : track === 'audio' ? TRACK_AUDIO_H : TRACK_TEXT_H;
        const ts = trackStates[track];
        return (
          <div key={track} className={`track-label ${track}-track`} style={{ height: h, position: 'relative' }}>
            <span className={ts.hidden ? 'tl-track-hidden' : ''}>
              {ts.locked ? '🔒' : ''}{ts.muted ? '🔇' : ''} {track.toUpperCase()}
            </span>
            <button
              className="tl-track-opts-btn"
              title="Track options"
              onClick={e => { e.stopPropagation(); setOpenTrackMenu(openTrackMenu === track ? null : track); }}
            >⋯</button>
            {openTrackMenu === track && (
              <div className="tl-track-menu">
                <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], locked: !s[track].locked}})); setOpenTrackMenu(null); }}>
                  {ts.locked ? '🔓 Unlock track' : '🔒 Lock track'}
                </button>
                <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], hidden: !s[track].hidden}})); setOpenTrackMenu(null); }}>
                  {ts.hidden ? '👁 Show track' : '🙈 Hide track'}
                </button>
                <button onClick={() => { setTrackStates(s => ({...s, [track]: {...s[track], muted: !s[track].muted}})); setOpenTrackMenu(null); }}>
                  {ts.muted ? '🔊 Unmute track' : '🔇 Mute track'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
