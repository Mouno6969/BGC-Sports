// ---------------------------------------------------------------------------
// ChannelCard — Clean, professional card design. No fake viewer counts.
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
      className="group block rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] overflow-hidden transition-all duration-200 hover:border-[var(--accent)]/30 hover:shadow-card-hover active:scale-[0.98]"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={channel.name}
            className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <svg className="h-10 w-10 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}

        {/* Live badge */}
        {isLive && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-400 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
            Live
          </span>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-all duration-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/90 text-white shadow-lg">
            <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5">
        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)] leading-tight">
          {channel.name}
        </h3>
        <div className="mt-2 flex items-center gap-2">
          {channel.group && (
            <span className="rounded-md bg-[var(--bg-tertiary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
              {channel.group.replace('Z_', '')}
            </span>
          )}
          {featured && (
            <span className="rounded-md bg-[var(--accent-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
