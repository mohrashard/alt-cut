// Z-index layering constants for the timeline
// Keep these in one place so stacking order is always intentional and predictable.

export const TIMELINE_LAYERS = {
    tracks: 0,
    clips: 10,
    clipHandles: 20,
    markers: 30,
    playhead: 40,
    snapIndicator: 50,
    contextMenu: 100,
} as const;

export type TimelineLayer = keyof typeof TIMELINE_LAYERS;