interface SnapIndicatorProps {
  snapGuideX: number | null;
}

export function SnapIndicator({ snapGuideX }: SnapIndicatorProps) {
  if (snapGuideX === null) return null;
  return <div className="snap-guide" style={{ left: snapGuideX }} />;
}
