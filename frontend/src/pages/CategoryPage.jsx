// ---------------------------------------------------------------------------
// CategoryPage — Shows channels filtered by group/category.
// FoxSports-style grid layout with header banner.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';

const CATEGORY_INFO = {
  Sports: {
    title: 'Sports Channels',
    description: 'Watch live sports including Cricket, Football, NBA, FIFA, Tennis and more.',
    gradient: 'from-green-900/50 via-ink-900 to-ink-900',
    accent: 'text-green-400',
  },
  Live: {
    title: 'Live Channels',
    description: 'Currently broadcasting live streams — IPL, Premier League, and more.',
    gradient: 'from-red-900/50 via-ink-900 to-ink-900',
    accent: 'text-red-400',
  },
  Bangla: {
    title: 'Bangla Channels',
    description: 'Popular Bangladeshi TV channels including news, entertainment, and drama.',
    gradient: 'from-blue-900/50 via-ink-900 to-ink-900',
    accent: 'text-blue-400',
  },
  News: {
    title: 'News Channels',
    description: 'Stay updated with international and local news channels.',
    gradient: 'from-purple-900/50 via-ink-900 to-ink-900',
    accent: 'text-purple-400',
  },
  Kids: {
    title: 'Kids Channels',
    description: 'Fun and educational content for children.',
    gradient: 'from-yellow-900/50 via-ink-900 to-ink-900',
    accent: 'text-yellow-400',
  },
  Religious: {
    title: 'Religious Channels',
    description: 'Islamic, Quran, and other religious programming.',
    gradient: 'from-amber-900/50 via-ink-900 to-ink-900',
    accent: 'text-amber-400',
  },
  Indian: {
    title: 'Indian Channels',
    description: 'Popular Indian TV channels and entertainment.',
    gradient: 'from-orange-900/50 via-ink-900 to-ink-900',
    accent: 'text-orange-400',
  },
  Movies: {
    title: 'Movie Channels',
    description: 'Watch movies and cinema channels.',
    gradient: 'from-pink-900/50 via-ink-900 to-ink-900',
    accent: 'text-pink-400',
  },
};

export default function CategoryPage() {
  const { group } = useParams();
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const info = CATEGORY_INFO[group] || {
    title: `${group} Channels`,
    description: `Browse ${group} channels.`,
    gradient: 'from-slate-900/50 via-ink-900 to-ink-900',
    accent: 'text-slate-400',
  };

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/channels?group=${encodeURIComponent(group)}`)
      .then((data) => {
        setChannels(data.channels || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [group]);

  const filtered = search
    ? channels.filter((ch) => ch.name && ch.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Category Header */}
      <section className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${info.gradient} p-5 sm:p-8`}>
        <div className="relative z-10">
          <nav className="mb-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Link to="/" className="hover:text-accent">Home</Link>
            <span>/</span>
            <span className={info.accent}>{group}</span>
          </nav>
          <h1 className="font-display text-xl font-extrabold text-white sm:text-2xl md:text-3xl">
            {info.title}
          </h1>
          <p className="mt-2 max-w-lg text-xs text-slate-400 sm:text-sm">{info.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500"></span>
            <span className="text-xs font-bold text-red-400">{channels.length} channels available</span>
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={`Search ${group} channels...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
      </div>

      {/* Channel Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-16">
          <svg className="mb-3 h-12 w-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm text-[var(--text-muted)]">No channels found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((ch, i) => (
            <ChannelCard key={i} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
