// ---------------------------------------------------------------------------
// HomePage — Enhanced with animated hero, live score ticker, countdown timer,
// live scores section, skeleton loading, and scroll-reveal animations.
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';
import LiveScoresSection from '../components/LiveScoresSection.jsx';
import CountdownTimer from '../components/CountdownTimer.jsx';

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

// Skeleton card placeholder
function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden">
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2 w-1/2 rounded" />
      </div>
    </div>
  );
}

// Scroll-reveal wrapper
function RevealOnScroll({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
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

  const handleMatchClick = () => {
    navigate('/category/Sports');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="skeleton rounded-2xl h-48 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-2xl p-8 md:p-12 hero-animated-bg"
      >
        {/* Animated grid pattern overlay */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2310B981' fill-opacity='0.15'%3E%3Cpath d='M30 30.5V28H0v-2h30v-2l3 4-3 4zM0 30h3v3H0v-3z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>

        {/* Glowing orbs */}
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            {/* LIVE NOW badge with neon glow pulse */}
            <div className="mb-3 flex items-center gap-2">
              <span className="live-now-badge flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
                Live Now
              </span>
            </div>

            <h1 className="font-display text-2xl font-extrabold text-white md:text-4xl lg:text-5xl">
              Live Sports{' '}
              <span className="hero-gradient-text bg-clip-text text-transparent">
                Streaming
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-slate-400">
              Watch 500+ live channels including ESPN, Fox Sports, Star Sports, Bein Sports, FIFA+, Cricket, Football and more.
            </p>

            {/* Countdown Timer */}
            <div className="mt-4">
              <CountdownTimer />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Link
                to="/category/Sports"
                className="hero-cta-btn rounded-xl px-5 py-2.5 text-sm font-bold text-black transition-all active:scale-95"
              >
                Watch Sports
              </Link>
              <Link
                to="/category/Live"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-95"
              >
                Live Channels
              </Link>
            </div>
            {/* Stats */}
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-lg font-extrabold text-emerald-400">500+</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Channels</div>
              </div>
              <div className="w-px bg-ink-600" />
              <div>
                <div className="text-lg font-extrabold text-amber-400">24/7</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Live</div>
              </div>
              <div className="w-px bg-ink-600" />
              <div>
                <div className="text-lg font-extrabold text-blue-400">HD</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Quality</div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── Live Scores Section ───────────────────────────────────────────── */}
      <RevealOnScroll>
        <LiveScoresSection onMatchClick={handleMatchClick} />
      </RevealOnScroll>

      {/* ── Search Bar ───────────────────────────────────────────────────── */}
      <RevealOnScroll delay={0.1}>
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md" ref={searchRef}>
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => search.length >= 2 && setShowSuggestions(true)}
              className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            {/* Auto-suggest dropdown */}
            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden"
                >
                  {searchSuggestions.map((ch, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearch(ch.name);
                        setShowSuggestions(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      {ch.logo && (
                        <img src={ch.logo} alt="" className="h-6 w-6 rounded object-contain bg-ink-700" onError={e => { e.target.style.display='none'; }} />
                      )}
                      <span className="flex-1 truncate">{ch.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{ch.group?.replace('Z_', '')}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {filteredChannels.length} channels available
          </div>
        </section>
      </RevealOnScroll>

      {/* ── Category Pills ───────────────────────────────────────────────── */}
      <RevealOnScroll delay={0.15}>
        <section className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => setActiveGroup('all')}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${
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
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${
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
      </RevealOnScroll>

      {/* ── Featured Channels ─────────────────────────────────────────────── */}
      {activeGroup === 'all' && !search && (
        <RevealOnScroll delay={0.2}>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Featured Sports Channels
              </h2>
              <Link
                to="/category/Sports"
                className="text-xs font-bold text-accent hover:text-accent-light transition-colors"
              >
                View All &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {featured.map((ch, i) => (
                <motion.div
                  key={`featured-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <ChannelCard channel={ch} featured />
                </motion.div>
              ))}
            </div>
          </section>
        </RevealOnScroll>
      )}

      {/* ── All Channels Grid ─────────────────────────────────────────────── */}
      <RevealOnScroll delay={0.25}>
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
                <motion.div
                  key={`ch-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: (i % 10) * 0.04 }}
                >
                  <ChannelCard channel={ch} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </RevealOnScroll>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0" />
    </div>
  );
}
