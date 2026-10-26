export function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="meter">
      <div
        className="meter-track"
        role="meter"
        aria-label="Machines used"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="muted small">
        {used} / {limit} used
      </span>
    </div>
  );
}
