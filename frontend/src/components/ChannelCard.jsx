// ---------------------------------------------------------------------------
// ChannelCard — FoxSports-style channel card with logo, name, group badge.
// Clicking navigates to the watch page with the channel URL.
// ---------------------------------------------------------------------------
import { Link } from 'react-router-dom';

const GROUP_BADGE_COLORS = {
  Sports: 'bg-green-500/20 text-green-400',
  Live: 'bg-red-500/20 text-red-400',
  Bangla: 'bg-blue-500/20 text-blue-400',
  News: 'bg-purple-500/20 text-purple-400',
  Kids: 'bg-yellow-500/20 text-yellow-400',
  Religious: 'bg-amber-500/20 text-amber-400',
  Indian: 'bg-orange-500/20 text-orange-400',
  Movies: 'bg-pink-500/20 text-pink-400',
  Documentary: 'bg-cyan-500/20 text-cyan-400',
  Music: 'bg-violet-500/20 text-violet-400',
};

export default function ChannelCard({ channel, featured = false }) {
  const { name, logo, group, url } = channel;
  const badgeColor = GROUP_BADGE_COLORS[group] || 'bg-slate-500/20 text-slate-400';

  const watchUrl = `/watch?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}&logo=${encodeURIComponent(logo || '')}`;

  return (
    <Link
      to={watchUrl}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] transition-all duration-200 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5 ${
        featured ? 'ring-1 ring-accent/10' : ''
      }`}
    >
      {/* Channel Logo */}
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[var(--bg-tertiary)] p-4">
        {logo && logo.startsWith('http') ? (
          <img
            src={logo}
            alt={name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={`flex h-full w-full items-center justify-center ${logo && logo.startsWith('http') ? 'hidden' : 'flex'}`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
            <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Live badge */}
        {(group === 'Live' || group === 'Sports') && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-red-500/90 px-1.5 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulseLive rounded-full bg-white"></span>
            <span className="text-[9px] font-bold uppercase text-white">Live</span>
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/90 shadow-lg">
            <svg className="h-5 w-5 text-black" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Channel Info */}
      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="truncate text-xs font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors">
          {name}
        </h3>
        <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badgeColor}`}>
          {group ? group.replace('Z_', '') : 'General'}
        </span>
      </div>
    </Link>
  );
}
