// ---------------------------------------------------------------------------
// ChannelCard — Large, clean card design matching the ESPN/DAZN mockup.
// Big logo area, channel name, category tag. No fake viewer counts.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { logoUrl } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';

export default function ChannelCard({ channel, featured }) {
  if (!channel) return null;

  const logoSrc = channel.logo ? logoUrl(channel.logo) : '';
  const isLive = channel.group?.toLowerCase() === 'live'
    || (channel.name || '').toLowerCase().includes('live');

  const watchUrl = `/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`;

  return (
    <Link
      to={watchUrl}
      className="card-sports group block overflow-hidden"
      aria-label={`Watch ${channel.name}`}
    >
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
          <div className="flex flex-col items-center gap-2" aria-hidden="true">
            <svg className="h-12 w-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="type-caption text-[var(--text-muted)]">{channel.name?.charAt(0) || 'TV'}</span>
          </div>
        )}

        {isLive && (
          <span className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <LiveBadge />
          </span>
        )}

        {/* Play overlay — always visible on touch, hover on desktop */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-100 transition-all duration-200 sm:bg-black/30 sm:opacity-0 sm:group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xl shadow-[var(--accent)]/30 sm:h-14 sm:w-14 sm:group-hover:scale-110 transition-transform">
            <svg className="h-5 w-5 ml-0.5 sm:h-6 sm:w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <h3 className="type-h3 truncate text-[var(--text-primary)]">
          {channel.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-2.5 sm:gap-2">
          {channel.group && (
            <span className="type-caption rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] px-2 py-0.5 font-medium text-[var(--text-muted)] sm:px-2.5">
              {channel.group.replace('Z_', '')}
            </span>
          )}
          {featured && (
            <span className="type-caption rounded-md bg-[var(--accent-muted)] border border-[var(--accent)]/20 px-2 py-0.5 font-semibold text-[var(--accent)] sm:px-2.5">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}