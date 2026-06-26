// ---------------------------------------------------------------------------
// ChannelCard — Redesigned: Clean, readable card with clear quality badges
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { logoUrl } from '../lib/config.js';

function getQualityBadge(channel) {
  const name = (channel.name || '').toLowerCase();
  if (name.includes('4k')) return { label: '4K', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  if (name.includes('hd') || name.includes('1080') || name.includes('720')) return { label: 'HD', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
  // Hash-based for variety
  const hash = (channel.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const opts = [
    { label: 'HD', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    { label: 'HD', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    { label: 'SD', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
    { label: '4K', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  ];
  return opts[hash % opts.length];
}

function getViewerCount(name) {
  const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = (hash % 50) * 100 + 100;
  if (base >= 1000) return `${(base / 1000).toFixed(1)}K`;
  return `${base}`;
}

export default function ChannelCard({ channel, featured }) {
  if (!channel) return null;

  const quality = getQualityBadge(channel);
  const viewers = getViewerCount(channel.name);
  const isLive = channel.group?.toLowerCase() === 'live' || 
    (channel.name || '').toLowerCase().includes('live') ||
    (channel.name || '').toLowerCase().includes('ipl');
  const logoSrc = channel.logo ? logoUrl(channel.logo) : '';

  return (
    <Link
      to={`/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`}
      className="group block rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden transition-all duration-200 hover:border-accent/30 hover:shadow-md hover:shadow-accent/5 active:scale-[0.98]"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={channel.name}
            className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}

        {/* Quality badge - top left */}
        <span className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[8px] font-bold border ${quality.color}`}>
          {quality.label}
        </span>

        {/* Live badge - top right */}
        {isLive && (
          <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[8px] font-bold text-red-400">
            <span className="h-1 w-1 rounded-full bg-red-500 animate-pulseLive" />
            LIVE
          </span>
        )}

        {/* Viewer count - bottom right */}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[8px] font-medium text-white/80">
          {viewers} watching
        </span>

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex h-10 w-10 items-center justify-center rounded-full bg-accent/90 text-black shadow-lg">
            <svg className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5">
        <h3 className="truncate text-[11px] font-bold text-[var(--text-primary)] leading-tight">
          {channel.name}
        </h3>
        <div className="mt-1 flex items-center gap-1.5">
          {channel.group && (
            <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--text-muted)] uppercase">
              {channel.group.replace('Z_', '')}
            </span>
          )}
          {featured && (
            <span className="rounded bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[8px] font-bold text-accent uppercase">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
