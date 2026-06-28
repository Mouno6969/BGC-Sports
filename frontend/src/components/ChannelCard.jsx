// ---------------------------------------------------------------------------
// ChannelCard — Large, clean card design matching the ESPN/DAZN mockup.
// Big logo area, channel name, category tag. No fake viewer counts.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { logoUrl } from '../lib/config.js';

export default function ChannelCard({ channel, featured }) {
  if (!channel) return null;

  const logoSrc = channel.logo ? logoUrl(channel.logo) : '';
  const isLive = channel.group?.toLowerCase() === 'live' ||
    (channel.name || '').toLowerCase().includes('live');

  return (
    <Link
      to={`/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`}
      className="group block rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] overflow-hidden transition-all duration-200 hover:border-[var(--accent)]/40 hover:shadow-lg hover:shadow-[var(--accent)]/5 active:scale-[0.98]"
    >
      {/* Large Logo/Thumbnail area */}
      <div className="relative aspect-[4/3] bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={channel.name}
            className="h-full w-full object-contain p-5 transition-transform duration-300 group-hover:scale-110 sm:p-8"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="h-12 w-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-[var(--text-muted)]">{channel.name?.charAt(0) || 'TV'}</span>
          </div>
        )}

        {/* Live badge */}
        {isLive && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-red-500/90 px-2 py-0.5 text-[9px] font-bold text-white uppercase shadow-lg sm:top-3 sm:right-3 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulseLive" />
            LIVE
          </span>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-all duration-200">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xl shadow-[var(--accent)]/30 transition-transform group-hover:scale-110">
            <svg className="h-6 w-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Channel Info */}
      <div className="p-3 sm:p-4">
        <h3 className="truncate text-xs font-bold text-[var(--text-primary)] leading-tight sm:text-sm">
          {channel.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-2.5 sm:gap-2">
          {channel.group && (
            <span className="rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:px-2.5 sm:text-[11px]">
              {channel.group.replace('Z_', '')}
            </span>
          )}
          {featured && (
            <span className="rounded-md bg-[var(--accent-muted)] border border-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] sm:px-2.5 sm:text-[11px]">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
