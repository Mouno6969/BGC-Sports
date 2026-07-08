// ---------------------------------------------------------------------------
// CategoryPage — Shows channels filtered by group/category.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';

const CATEGORY_INFO = {
  Sports: {
    title: 'Sports Channels',
    description: 'Watch live sports including Cricket, Football, NBA, FIFA, Tennis and more.',
    gradient: 'from-green-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-green-400',
  },
  Live: {
    title: 'Live Channels',
    description: 'Currently broadcasting live streams — IPL, Premier League, and more.',
    gradient: 'from-red-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-red-400',
  },
  Bangla: {
    title: 'Bangla Channels',
    description: 'Popular Bangladeshi TV channels including news, entertainment, and drama.',
    gradient: 'from-blue-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-blue-400',
  },
  News: {
    title: 'News Channels',
    description: 'Stay updated with international and local news channels.',
    gradient: 'from-purple-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-purple-400',
  },
  Kids: {
    title: 'Kids Channels',
    description: 'Fun and educational content for children.',
    gradient: 'from-yellow-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-yellow-400',
  },
  Religious: {
    title: 'Religious Channels',
    description: 'Islamic, Quran, and other religious programming.',
    gradient: 'from-amber-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-amber-400',
  },
  Indian: {
    title: 'Indian Channels',
    description: 'Popular Indian TV channels and entertainment.',
    gradient: 'from-orange-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-orange-400',
  },
  Movies: {
    title: 'Movie Channels',
    description: 'Watch movies and cinema channels.',
    gradient: 'from-pink-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-pink-400',
  },
};

export default function CategoryPage() {
  const { group } = useParams();
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const info = CATEGORY_INFO[group] || {
    title: `${group} Channels`,
    description: `Browse ${group} channels.`,
    gradient: 'from-slate-900/50 via-[var(--bg-primary)] to-[var(--bg-primary)]',
    accent: 'text-slate-400',
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
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
    <div className="page-container space-y-6">
      <section className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${info.gradient} p-5 sm:p-8`}>
        <div className="relative z-10">
          <nav className="mb-3 flex items-center gap-2 type-caption text-[var(--text-muted)]" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-[var(--accent)]">Home</Link>
            <span aria-hidden="true">/</span>
            <span className={info.accent}>{group}</span>
          </nav>
          <h1 className="type-h1 text-[var(--text-primary)]">{info.title}</h1>
          <p className="type-body mt-2 max-w-lg text-[var(--text-secondary)]">{info.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500" />
            <span className="text-xs font-bold text-red-400">{channels.length} channels available</span>
          </div>
        </div>
      </section>

      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder={`Search ${group} channels...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={`Search ${group} channels`}
          className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
        />
      </div>

      {loading ? (
        <div className="channel-grid">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={`skel-${i}`} className="skeleton aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-16 text-center">
          <p className="type-body text-[var(--text-muted)]">{error}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--accent)] hover:underline">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-16">
          <p className="type-body text-[var(--text-muted)]">No channels found</p>
          {search && (
            <button type="button" onClick={() => setSearch('')} className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--accent)] hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="channel-grid">
          {filtered.map((ch) => (
            <ChannelCard key={ch.url || ch.name} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}