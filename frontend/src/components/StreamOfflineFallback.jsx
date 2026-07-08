// ---------------------------------------------------------------------------
// StreamOfflineFallback — actionable error when a stream fails
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import LiveBadge from './LiveBadge.jsx';

function channelWatchUrl(ch, source = '') {
  const params = new URLSearchParams({
    url: ch.url,
    name: ch.name,
    logo: ch.logo || '',
  });
  if (source || ch.source === 'fifa') params.set('source', source || 'fifa');
  return `/watch?${params.toString()}`;
}

export default function StreamOfflineFallback({
  channelName,
  alternatives = [],
  loading = false,
  onRetry,
  compact = false,
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'gap-3 max-w-sm' : 'gap-4 max-w-md py-4'}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
        <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>

      <div>
        <h3 className="type-h3 text-[var(--text-primary)]">Stream offline</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {channelName ? `${channelName} isn't playing right now.` : 'This stream is unavailable.'}
          {' '}Try one of these instead:
        </p>
      </div>

      {loading ? (
        <div className="w-full space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : alternatives.length > 0 ? (
        <div className="w-full space-y-2">
          {alternatives.slice(0, 3).map((ch) => (
            <Link
              key={ch.url || ch.id || ch.name}
              to={channelWatchUrl(ch, ch.source || 'fifa')}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)]/40 active:scale-[0.99]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                {ch.logo ? (
                  <img src={ch.logo} alt="" className="h-full w-full object-contain p-0.5" />
                ) : (
                  <svg className="h-4 w-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{ch.name}</span>
              <LiveBadge className="shrink-0 scale-90" />
            </Link>
          ))}
        </div>
      ) : (
        <Link
          to="/?tab=worldcup"
          className="inline-flex min-h-[44px] items-center rounded-xl bg-yellow-500 px-5 py-2 text-sm font-bold text-black"
        >
          Browse FIFA Channels
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-4 py-2 text-xs font-bold text-[var(--text-primary)]"
          >
            Retry stream
          </button>
        )}
        <Link
          to="/?tab=worldcup"
          className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-4 py-2 text-xs font-bold text-[var(--accent)]"
        >
          World Cup
        </Link>
        <Link
          to="/category/Sports"
          className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          All sports
        </Link>
      </div>
    </div>
  );
}