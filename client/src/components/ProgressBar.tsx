/**
 * The habit-loop progress meter. It is deliberately pre-filled at step 1 (the
 * goal-gradient effect): a child who already sees progress is far likelier to
 * finish than one starting from an empty bar.
 */
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label ?? 'Check-in progress'}
    >
      <div className="progress__fill" style={{ width: `${clamped}%` }} />
      <div className="progress__label">{'★'.repeat(Math.round(clamped / 25))}</div>
    </div>
  );
}
