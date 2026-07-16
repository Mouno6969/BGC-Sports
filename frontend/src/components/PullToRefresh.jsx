// ---------------------------------------------------------------------------
// PullToRefresh indicator — spinning football + pulsing logo on mobile.
// ---------------------------------------------------------------------------

/** Classic football (soccer ball) SVG with pentagon pattern. */
function FootballIcon({ className = '', style, spinning = false }) {
  return (
    <svg
      className={`ptr-football ${spinning ? 'ptr-football--spin' : ''} ${className}`}
      style={style}
      viewBox="0 0 64 64"
      width="28"
      height="28"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ptrBallGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
      </defs>
      {/* Outer sphere */}
      <circle cx="32" cy="32" r="30" fill="url(#ptrBallGrad)" stroke="#0f172a" strokeWidth="1.5" />
      {/* Center pentagon */}
      <path
        d="M32 16 L40 22 L37 32 L27 32 L24 22 Z"
        fill="#0f172a"
      />
      {/* Surrounding hex-ish panels (stylized seams) */}
      <path
        d="M32 16 L40 22 M40 22 L48 18 M40 22 L37 32 M37 32 L46 38 M37 32 L27 32 M27 32 L18 38 M27 32 L24 22 M24 22 L16 18 M46 38 L40 48 M18 38 L24 48 M40 48 L32 52 L24 48"
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Accent stitch dots */}
      <circle cx="32" cy="52" r="1.4" fill="#0f172a" />
      <circle cx="48" cy="18" r="1.2" fill="#0f172a" />
      <circle cx="16" cy="18" r="1.2" fill="#0f172a" />
    </svg>
  );
}

export default function PullToRefreshIndicator({
  pullDistance = 0,
  progress = 0,
  refreshing = false,
  pulling = false,
}) {
  if (!pulling && !refreshing) return null;

  const y = refreshing ? 56 : Math.min(88, pullDistance);
  const scale = refreshing ? 1 : 0.5 + progress * 0.5;
  const opacity = refreshing ? 1 : Math.min(1, 0.2 + progress * 0.85);
  const ready = progress >= 1 || refreshing;
  // Rotate with pull; full spin once armed
  const pullRotate = refreshing ? 0 : progress * 360;

  const label = refreshing
    ? 'Updating scores & channels…'
    : ready
      ? 'Release to refresh'
      : 'Pull to refresh';

  return (
    <div
      className="ptr-indicator pointer-events-none fixed left-0 right-0 z-[60] flex justify-center"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(10, y - 6)}px)`,
        opacity,
      }}
      aria-live="polite"
      aria-busy={refreshing}
      role="status"
    >
      <div
        className={`ptr-pill flex items-center gap-2.5 rounded-full border px-3.5 py-2 shadow-xl backdrop-blur-md ${
          ready
            ? 'border-accent/40 bg-[var(--bg-secondary)]/95 shadow-accent/10'
            : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]/95'
        }`}
        style={{ transform: `scale(${scale})` }}
      >
        {/* Spinning football (or rotate with pull distance) */}
        <span className="ptr-ball-wrap relative flex h-8 w-8 items-center justify-center">
          {refreshing && <span className="ptr-pulse-ring" aria-hidden="true" />}
          <FootballIcon
            spinning={refreshing || ready}
            style={
              !refreshing
                ? { transform: `rotate(${pullRotate}deg)` }
                : undefined
            }
          />
        </span>

        {/* Pulsing BGC mark while refreshing */}
        {refreshing && (
          <span className="ptr-logo-pulse relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-accent/15 ring-1 ring-accent/30">
            <img
              src="/logo_bgc.png"
              alt=""
              className="h-5 w-5 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </span>
        )}

        <span
          className={`text-[11px] font-bold tracking-wide ${
            ready ? 'text-accent' : 'text-[var(--text-secondary)]'
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
