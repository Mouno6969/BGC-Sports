// ---------------------------------------------------------------------------
// HomePage — Redesigned: Clean, organized, beginner-friendly with tab navigation
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';
import LiveScoresSection from '../components/LiveScoresSection.jsx';
import WorldCupSection from '../components/WorldCupSection.jsx';

// Main content tabs for the homepage
const MAIN_TABS = [
  { id: 'channels', label: 'Channels', icon: '📺' },
  { id: 'worldcup', label: 'World Cup', icon: '🏆' },
  { id: 'scores', label: 'Live Scores', icon: '⚽' },
];

// Skeleton card placeholder
function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
      <div className="skeleton aspect-video w-full" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="skeleton rounded-2xl h-40 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 space-y-5">
      {/* ── Compact Hero ──────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl p-6 md:p-8 hero-animated-bg"
      >
        {/* Subtle glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
                Live Now
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{channels.length} channels available</span>
            </div>
            <h1 className="font-display text-xl font-extrabold text-white md:text-3xl">
              Live Sports <span className="hero-gradient-text bg-clip-text text-transparent">Streaming</span>
            </h1>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              Watch live sports, news, and entertainment channels in HD. Free and instant — no sign-up required.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/category/Sports"
              className="hero-cta-btn rounded-lg px-4 py-2 text-xs font-bold text-black transition-all active:scale-95"
            >
              Watch Sports
            </Link>
            <Link
              to="/category/Live"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-95"
            >
              Live TV
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ── Main Tab Navigation ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition-all active:scale-95 ${
              activeTab === tab.id
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'channels' && (
          <motion.div
            key="channels"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Search + Category Filter */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search */}
              <div className="relative flex-1 max-w-sm" ref={searchRef}>
                <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                  className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
                {/* Auto-suggest dropdown */}
                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden"
                    >
                      {searchSuggestions.map((ch, i) => (
                        <Link
                          key={i}
                          to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                          onClick={() => setShowSuggestions(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                          {ch.logo && (
                            <img src={ch.logo} alt="" className="h-5 w-5 rounded object-contain bg-ink-700" onError={e => { e.target.style.display='none'; }} />
                          )}
                          <span className="flex-1 truncate">{ch.name}</span>
                          <span className="text-[9px] text-[var(--text-muted)]">{ch.group?.replace('Z_', '')}</span>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Results count */}
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                Showing {filteredChannels.length} of {channels.length} channels
              </span>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setActiveGroup('all')}
                className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold transition-all active:scale-95 ${
                  activeGroup === 'all'
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                }`}
              >
                All ({channels.length})
              </button>
              {groups.map((g) => (
                <button
                  key={g.name}
                  onClick={() => setActiveGroup(g.name)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold transition-all active:scale-95 ${
                    activeGroup === g.name
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                  }`}
                >
                  {g.name.replace('Z_', '')} ({g.count})
                </button>
              ))}
            </div>

            {/* Featured Section */}
            {activeGroup === 'all' && !search && featured.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseLive" />
                    Featured Sports
                  </h2>
                  <Link to="/category/Sports" className="text-[10px] font-bold text-accent hover:text-accent-light">
                    View All →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {featured.map((ch, i) => (
                    <ChannelCard key={`feat-${i}`} channel={ch} featured />
                  ))}
                </div>
              </section>
            )}

            {/* All Channels Grid */}
            <section>
              <h2 className="mb-3 font-display text-sm font-bold text-[var(--text-primary)]">
                {activeGroup === 'all' ? 'All Channels' : activeGroup.replace('Z_', '')}
              </h2>
              {filteredChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="h-10 w-10 text-[var(--text-muted)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-sm text-[var(--text-muted)]">No channels found</p>
                  <button onClick={() => { setSearch(''); setActiveGroup('all'); }} className="mt-2 text-xs text-accent hover:underline">
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filteredChannels.map((ch, i) => (
                    <motion.div
                      key={`ch-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    >
                      <ChannelCard channel={ch} />
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {activeTab === 'worldcup' && (
          <motion.div
            key="worldcup"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <WorldCupSection />
          </motion.div>
        )}

        {activeTab === 'scores' && (
          <motion.div
            key="scores"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <LiveScoresSection onMatchClick={() => navigate('/category/Sports')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0" />
    </div>
  );
}
