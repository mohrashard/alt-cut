import { useLayoutEffect, useState, type RefObject } from 'react';

interface SnapIndicatorPosition {
    height: number;
    topPosition: number;
}

/**
 * Calculates the exact height and top offset for the snap indicator line
 * so it spans only the actual track area, accounting for vertical scroll.
 */
export function useSnapIndicatorPosition(
    timelineRef: RefObject<HTMLDivElement | null>,
    tracksScrollRef: RefObject<HTMLDivElement | null>,
): SnapIndicatorPosition {
    const [position, setPosition] = useState<SnapIndicatorPosition>({
        height: 0,
        topPosition: 0,
    });

    useLayoutEffect(() => {
        function measure() {
            const timeline = timelineRef.current;
            const tracksScroll = tracksScrollRef.current;
            if (!timeline || !tracksScroll) return;

            const timelineRect = timeline.getBoundingClientRect();
            const tracksRect = tracksScroll.getBoundingClientRect();

            const topPosition = tracksRect.top - timelineRect.top;
            const height = tracksRect.height;

            setPosition({ height, topPosition });
        }

        measure();

        // Re-measure on resize or scroll
        const timeline = timelineRef.current;
        const tracksScroll = tracksScrollRef.current;

        const resizeObserver = new ResizeObserver(measure);
        if (timeline) resizeObserver.observe(timeline);
        if (tracksScroll) resizeObserver.observe(tracksScroll);

        tracksScroll?.addEventListener('scroll', measure, { passive: true });

        return () => {
            resizeObserver.disconnect();
            tracksScroll?.removeEventListener('scroll', measure);
        };
    }, [timelineRef, tracksScrollRef]);

    return position;
}