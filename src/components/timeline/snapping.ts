// Snapping utilities and types for the timeline

export type SnapType = 'clip-start' | 'clip-end' | 'playhead' | 'marker';

export interface SnapPoint {
    /** The time in seconds where the snap occurred */
    timeSec: number;
    /** The pixel X position of the snap point */
    x: number;
    /** The type of snap target */
    type?: SnapType;
}