// ---------------------------------------------------------------------------
// CategoryPage — Shows channels filtered by group/category.
// Restyled to mirror the landing page: stadium hero with layered gradients,
// Montserrat type scale, token-based controls, and card-sports states.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';

const CATEGORY_INFO = {
  Sports: {
    title: 'Sports Channels',
    description: 'Watch live sports including Cricket, Football, NBA, FIFA, Tennis and more.',
    tint: 'from-emerald-900/60',
    badge: 'bg-[var(--accent-muted)] text-[var(--accent-light)] ring-[var(--accent)]/25',
    icon: '⚽',
  },
  Live: {
    title: 'Live Channels',
    description: 'Currently broadcasting live streams — IPL, Premier League, and more.',
    tint: 'from-red-900/60',
    badge: 'bg-red-500/10 text-red-400 ring-red-500/25',
    icon: '🔴',
  },
  Bangla: {
    title: 'Bangla Channels',
    description: 'Popular Bangladeshi TV channels including news, entertainment, and drama.',
    tint: 'from-blue-900/60',
    badge: 'bg-blue-500/10 text-blue-400 ring-blue-500/25',
    icon: '📺',
  },
  News: {
    title: 'News Channels',
    description: 'Stay updated with international and local news channels.',
    tint: 'from-purple-900/60',
    badge: 'bg-purple-500/10 text-purple-400 ring-purple-500/25',
    icon: '📰',
  },
  Kids: {
    title: 'Kids Channels',
    description: 'Fun and educational content for children.',
    tint: 'from-yellow-900/60',
    badge: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/25',
    icon: '🧸',
  },
  Religious: {
    title: 'Religious Channels',
    description: 'Islamic, Quran, and other religious programming.',
    tint: 'from-amber-900/60',
    badge: 'bg-amber-500/10 text-amber-400 ring-amber-500/25',
    icon: '🕌',
  },
  Indian: {
    title: 'Indian Channels',
    description: 'Popular Indian TV channels and entertainment.',
    tint: 'from-orange-900/60',
    badge: 'bg-orange-500/10 text-orange-400 ring-orange-500/25',
    icon: '🎬',
  },
  Movies: {
    title: 'Movie Channels',
    description: 'Watch movies and cinema channels.',
    tint: 'from-pink-900/60',
    badge: 'bg-pink-500/10 text-pink-400 ring-pink-500/25',
    icon: '🍿',
  },
};

function SkeletonCard() {
  return (
    <div className="card-sports overflow-hidden">
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="p-4 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function CategoryPage() {
  const { group } = useParams();
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const info = CATEGORY_INFO[group] || {
    title: `${group} Channels`,
    description: `Browse ${group} channels.`,
    tint: 'from-slate-900/60',
    badge: 'bg-slate-500/10 text-slate-400 ring-slate-500/25',
    icon: '📡',
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSearch('');
    apiGet(`/api/channels?group=${encodeURIComponent(group)}`)
      .then((data) => setChannels(data.channels || []))
      .catch(() => {
        setError('Failed to load channels for this category.');
        setChannels([]);
      })
      .finally(() => setLoading(false));
  }, [group]);

  const filtered = search
    ? channels.filter((ch) => ch.name && ch.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  return (
    <div className="page-container space-y-7 sm:space-y-8">
      {/* ── Hero — same stadium treatment as the landing page ── */}
      <section className="relative flex min-h-[180px] items-center overflow-hidden rounded-2xl sm:min-h-[220px]">
        <div className="absolute inset-0 bg-[url('/stadium-bg.jpg')] bg-cover bg-center" aria-hidden="true" />
        <div className={`absolute inset-0 bg-gradient-to-r ${info.tint} via-[var(--bg-primary)]/75 to-[var(--bg-primary)]/40`} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)]/85 to-transparent" aria-hidden="true" />

        <div className="relative z-10 w-full px-5 py-8 sm:px-8 sm:py-10">
          <nav className="mb-3 flex items-center gap-2 type-caption text-[var(--text-secondary)]" aria-label="Breadcrumb">
            <Link to="/" className="transition-colors hover:text-[var(--accent)]">Home</Link>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[var(--text-primary)]">{group}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-3xl sm:text-4xl" aria-hidden="true">{info.icon}</span>
            <h1 className="type-h1 text-[var(--text-primary)]">{info.title}</h1>
          </div>
          <p className="type-body mt-2 max-w-lg text-[var(--text-secondary)]">{info.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${info.badge}`}>
              {loading ? 'Loading…' : `${channels.length} channels`}
            </span>
            <span className="live-badge">
              <span className="live-badge__dot" aria-hidden="true" />
              Live now
            </span>
          </div>
        </div>
      </section>

      {/* ── Search + count ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder={`Search ${group} channels...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${group} channels`}
            className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        {!loading && !error && (
          <span className="type-body text-[var(--text-muted)]">
            {filtered.length} channels
          </span>
        )}
      </div>

      {/* ── Grid / states ── */}
      {loading ? (
        <div className="channel-grid">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={`skel-${i}`} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="type-h2 text-[var(--text-primary)]">Unable to load channels</h2>
          <p className="type-body mt-2 max-w-md text-[var(--text-secondary)]">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="mb-4 h-14 w-14 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="type-body text-[var(--text-muted)]">No channels found</p>
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              Clear search
            </button>
          ) : (
            <Link to="/" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--accent)] hover:underline">
              Browse all channels
            </Link>
          )}
        </div>
      ) : (
        <div className="channel-grid animate-fadeIn">
          {filtered.map((ch) => (
            <ChannelCard key={ch.url || ch.name} channel={ch} />
          ))}
        </div>
      )}

      <div className="h-4 md:h-0" />
    </div>
  );
}
