import { useRef, useState, useEffect, useCallback } from 'react';

interface AudioVolumeLineProps {
  volume: number;
  // REMOVED: `height` — was declared in the interface and extracted from props
  // but never read anywhere inside the component body. Caused a TS/lint warning.
  // Also removed from AudioContent and AudioShadowElement in timeline-element.tsx.
  disabled?: boolean;
  onChange: (newVolume: number) => void;
  onDragEnd: (finalVolume: number) => void;
}

const MAX_VOL = 2.0;
const KEYBOARD_STEP = 0.05; // 5% nudge per arrow key press

function clampVolume(v: number): number {
  return Math.max(0, Math.min(MAX_VOL, v));
}

function volFromY(localY: number, rectHeight: number): number {
  const clampedY = Math.max(0, Math.min(rectHeight, localY));
  return clampVolume(((rectHeight - clampedY) / rectHeight) * MAX_VOL);
}

export function AudioVolumeLine({
  volume,
  disabled = false,
  onChange,
  onDragEnd,
}: AudioVolumeLineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverVol, setHoverVol] = useState<number | null>(null);

  // Track volume at drag-start so Escape can revert cleanly
  const dragStartVolumeRef = useRef<number>(volume);

  const safeVolume = typeof volume === 'number' && !isNaN(volume) ? volume : 1.0;
  const yPosPercent = Math.max(0, Math.min(100, 100 - (safeVolume / MAX_VOL) * 100));

  // ─── Mouse drag ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newVol = volFromY(e.clientY - rect.top, rect.height);
      onChange(newVol);
      setHoverVol(newVol);
    };

    const commit = (e: MouseEvent) => {
      setIsDragging(false);
      setHoverVol(null);
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      onDragEnd(volFromY(e.clientY - rect.top, rect.height));
    };

    // FIX: was `document.addEventListener('mouseleave', ...)` which fires on
    // every child element boundary crossing, causing false drag-cancel events.
    // `window.blur` only fires when focus truly leaves the browser window.
    const onWindowBlur = () => {
      setIsDragging(false);
      setHoverVol(null);
      onDragEnd(safeVolume);
    };

    // Escape reverts to the volume that was active when the drag began
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDragging(false);
        setHoverVol(null);
        onChange(dragStartVolumeRef.current);
        onDragEnd(dragStartVolumeRef.current);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', commit);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', commit);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isDragging, onChange, onDragEnd, safeVolume]);

  // ─── Touch drag (mobile support) ───────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!containerRef.current || e.touches.length === 0) return;
      e.preventDefault(); // prevent page scroll while adjusting volume
      const rect = containerRef.current.getBoundingClientRect();
      const newVol = volFromY(e.touches[0].clientY - rect.top, rect.height);
      onChange(newVol);
      setHoverVol(newVol);
    };

    const onTouchEnd = (e: TouchEvent) => {
      setIsDragging(false);
      setHoverVol(null);
      if (!containerRef.current || e.changedTouches.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      onDragEnd(volFromY(e.changedTouches[0].clientY - rect.top, rect.height));
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDragging, onChange, onDragEnd]);

  // ─── Keyboard accessibility ────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = clampVolume(safeVolume + KEYBOARD_STEP);
        onChange(next);
        onDragEnd(next);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = clampVolume(safeVolume - KEYBOARD_STEP);
        onChange(next);
        onDragEnd(next);
      }
    },
    [safeVolume, onChange, onDragEnd],
  );

  // Clamp tooltip top so it never clips above the container
  const tooltipTopPercent = Math.max(4, yPosPercent);

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      className="audio-volume-container"
      style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}
    >
      {/* 6px hit area — the only interactive element */}
      <div
        ref={handleRef}
        className="audio-volume-handle"
        role="slider"
        aria-label="Clip volume"
        aria-valuenow={Math.round(safeVolume * 100)}
        aria-valuemin={0}
        aria-valuemax={Math.round(MAX_VOL * 100)}
        tabIndex={0}
        style={{
          position: 'absolute',
          top: `${yPosPercent}%`,
          left: 0,
          right: 0,
          height: '6px',
          transform: 'translateY(-50%)',
          cursor: isDragging ? 'grabbing' : 'ns-resize',
          pointerEvents: 'auto',
          outline: 'none',
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          dragStartVolumeRef.current = safeVolume;
          setIsDragging(true);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          dragStartVolumeRef.current = safeVolume;
          setIsDragging(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(255,255,255,0.6)'; }}
        onBlur={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
      />

      {/* Visual line — thickens and glows while dragging */}
      <div
        className="audio-volume-line"
        style={{
          position: 'absolute',
          top: `${yPosPercent}%`,
          left: 0,
          right: 0,
          height: isDragging ? '3px' : '2px',
          backgroundColor: isDragging ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
          boxShadow: isDragging
            ? '0 0 6px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.5)'
            : '0 1px 2px rgba(0,0,0,0.5)',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          transition: isDragging ? 'none' : 'height 0.1s, box-shadow 0.1s',
        }}
      />

      {/* Volume tooltip — visible only while dragging */}
      {isDragging && hoverVol !== null && (
        <div
          className="audio-volume-tooltip"
          style={{
            position: 'absolute',
            top: `calc(${tooltipTopPercent}% - 22px)`,
            left: '10px',
            backgroundColor: 'rgba(0,0,0,0.85)',
            color: 'white',
            fontSize: '11px',
            fontWeight: 500,
            padding: '4px 6px',
            borderRadius: '4px',
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: 'sans-serif',
            animation: 'tooltipFadeIn 0.1s ease',
          }}
        >
          {Math.round(hoverVol * 100)}%
        </div>
      )}

      <style>{`
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}