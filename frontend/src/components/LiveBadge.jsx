export default function LiveBadge({ label = 'LIVE', className = '' }) {
  return (
    <span className={`live-badge ${className}`}>
      <span className="live-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}