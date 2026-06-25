// ---------------------------------------------------------------------------
// HomePage — FoxSports-style homepage with hero, featured channels,
// category pills, channel grid, and search.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';

const CATEGORY_COLORS = {
  Sports: 'bg-green-500/10 text-green-400 border-green-500/20',
  Live: 'bg-red-500/10 text-red-400 border-red-500/20',
  Bangla: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  News: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Kids: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Religious: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Indian: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Movies: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Documentary: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  Music: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(searchParams.get('search') === 'true');

  useEffect(() => {
    Promise.all([
      apiGet('/api/channels'),
      apiGet('/api/channels/featured'),
      apiGet('/api/channels/groups'),
    ])
      .then(([allData, featuredData, groupsData]) => {
        setChannels(allData.channels || []);
        setFeatured(featuredData.channels || []);
        setGroups(groupsData.groups || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load channels:', err);
        setLoading(false);
      });
  }, []);

  // Filter channels
  const filteredChannels = channels.filter((ch) => {
    const matchGroup =
      activeGroup === 'all' ||
      (ch.group && ch.group.toLowerCase() === activeGroup.toLowerCase());
    const matchSearch =
      !search ||
      (ch.name && ch.name.toLowerCase().includes(search.toLowerCase())) ||
      (ch.group && ch.group.toLowerCase().includes(search.toLowerCase()));
    return matchGroup && matchSearch;
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-ink-900 via-ink-800 to-ink-900 p-8 md:p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2322c55e' fill-opacity='0.3'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2l2 3-2 3zM0 20h2v2H0v-2z'/%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        <div className="relative z-10 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulseLive rounded-full bg-red-500"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">Live Now</span>
            </div>
            <h1 className="font-display text-2xl font-extrabold text-white md:text-4xl">
              Live Sports Streaming
            </h1>
            <p className="mt-2 max-w-lg text-sm text-slate-400">
              Watch 500+ live channels including ESPN, Fox Sports, Star Sports, Bein Sports, FIFA+, Cricket, Football and more.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/category/Sports"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black transition-all hover:bg-accent-light hover:shadow-glow-green"
            >
              Watch Sports
            </Link>
            <Link
              to="/category/Live"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20"
            >
              Live Channels
            </Link>
          </div>
        </div>
      </section>

      {/* Search Bar */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {filteredChannels.length} channels available
        </div>
      </section>

      {/* Category Pills */}
      <section className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setActiveGroup('all')}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
            activeGroup === 'all'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          ALL ({channels.length})
        </button>
        {groups.map((g) => {
          const colorClass = CATEGORY_COLORS[g.name] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
          const isActive = activeGroup === g.name;
          return (
            <button
              key={g.name}
              onClick={() => setActiveGroup(g.name)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                isActive
                  ? colorClass
                  : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {g.name.replace('Z_', '')} ({g.count})
            </button>
          );
        })}
      </section>

      {/* Featured Channels (Sports) */}
      {activeGroup === 'all' && !search && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Featured Sports Channels
            </h2>
            <Link
              to="/category/Sports"
              className="text-xs font-bold text-accent hover:text-accent-light"
            >
              View All &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {featured.map((ch, i) => (
              <ChannelCard key={`featured-${i}`} channel={ch} featured />
            ))}
          </div>
        </section>
      )}

      {/* All Channels Grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            {activeGroup === 'all' ? 'All Channels' : activeGroup.replace('Z_', '')}
          </h2>
        </div>
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-16">
            <svg className="mb-3 h-12 w-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm text-[var(--text-muted)]">No channels found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredChannels.map((ch, i) => (
              <ChannelCard key={`ch-${i}`} channel={ch} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
