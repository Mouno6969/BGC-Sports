// ---------------------------------------------------------------------------
// HomePage — Premium, clean design with proper hierarchy
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';
import LiveScoresSection from '../components/LiveScoresSection.jsx';
import WorldCupSection from '../components/WorldCupSection.jsx';

const MAIN_TABS = [
  { id: 'channels', label: 'Channels' },
  { id: 'worldcup', label: 'World Cup' },
  { id: 'scores', label: 'Live Scores' },
];

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-card)]">
      <div className="skeleton aspect-video w-full" />
      <div className="p-4 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('channels');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

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

  // Auto-suggest for search
  useEffect(() => {
    if (!search.trim() || search.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = search.toLowerCase();
    const matches = channels
      .filter(ch => ch.name && ch.name.toLowerCase().includes(q))
      .slice(0, 6);
    setSearchSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [search, channels]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
      <div className="mx-auto max-w-7xl px-4 lg:px-6 py-8 space-y-8">
        <div className="skeleton rounded-2xl h-48 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 lg:px-6 py-6 space-y-8">
      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-primary)] via-[var(--bg-secondary)] to-[var(--bg-tertiary)]" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=60')] bg-cover bg-center opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent" />

        <div className="relative z-10 px-8 py-12 md:py-16 md:px-12">
          <div className="max-w-lg">
            <h1 className="font-display text-3xl font-extrabold text-[var(--text-primary)] md:text-4xl lg:text-5xl leading-tight">
              Live Sports{' '}
              <span className="hero-gradient-text">Streaming</span>
            </h1>
            <p className="mt-3 text-base text-[var(--text-secondary)] max-w-md">
              Your home for live sports, anytime, anywhere. Watch in HD — no sign-up required.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link
                to="/category/Sports"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97]"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Sports
              </Link>
              <Link
                to="/category/Live"
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.97]"
              >
                <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500" />
                Live TV
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Tab Navigation ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[var(--border-primary)]">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === 'channels' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Search + Filter Row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-sm" ref={searchRef}>
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
              />
              {/* Auto-suggest dropdown */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden">
                  {searchSuggestions.map((ch, i) => (
                    <Link
                      key={i}
                      to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                      onClick={() => setShowSuggestions(false)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <span className="flex-1 truncate">{ch.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{ch.group?.replace('Z_', '')}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Results count */}
            <span className="text-sm text-[var(--text-muted)]">
              {filteredChannels.length} channels
            </span>
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setActiveGroup('all')}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                activeGroup === 'all'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
              }`}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.name}
                onClick={() => setActiveGroup(g.name)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeGroup === g.name
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                {g.name.replace('Z_', '')}
              </button>
            ))}
          </div>

          {/* Featured Section */}
          {activeGroup === 'all' && !search && featured.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  Featured Channels
                </h2>
                <Link to="/category/Sports" className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-light)]">
                  View All
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {featured.map((ch, i) => (
                  <ChannelCard key={`feat-${i}`} channel={ch} featured />
                ))}
              </div>
            </section>
          )}

          {/* All Channels Grid */}
          <section>
            <h2 className="mb-4 font-display text-lg font-bold text-[var(--text-primary)]">
              {activeGroup === 'all' ? 'All Channels' : activeGroup.replace('Z_', '')}
            </h2>
            {filteredChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="h-12 w-12 text-[var(--text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-base text-[var(--text-muted)]">No channels found</p>
                <button onClick={() => { setSearch(''); setActiveGroup('all'); }} className="mt-3 text-sm text-[var(--accent)] hover:underline">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {filteredChannels.map((ch, i) => (
                  <ChannelCard key={`ch-${i}`} channel={ch} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'worldcup' && (
        <div className="animate-fadeIn">
          <WorldCupSection />
        </div>
      )}

      {activeTab === 'scores' && (
        <div className="animate-fadeIn">
          <LiveScoresSection />
        </div>
      )}

      {/* Bottom spacing for mobile nav */}
      <div className="h-4 md:h-0" />
    </div>
  );
}
