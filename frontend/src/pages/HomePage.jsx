// ---------------------------------------------------------------------------
// HomePage — Premium, clean design matching the ESPN/DAZN-style mockup
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';

const WorldCupSection = lazy(() => import('../components/WorldCupSection.jsx'));
const LiveScoresSection = lazy(() => import('../components/LiveScoresSection.jsx'));

function TabLoader() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
    </div>
  );
}

const MAIN_TABS = [
  { id: 'worldcup', label: 'World Cup' },
  { id: 'channels', label: 'Channels' },
  { id: 'scores', label: 'Live Scores' },
];

const PRIMARY_CATEGORIES = ['All', 'Sports', 'Live', 'News', 'Entertainment'];

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

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  const tabParam = searchParams.get('tab');
  const activeTab = MAIN_TABS.some((t) => t.id === tabParam) ? tabParam : 'worldcup';

  const setActiveTab = (tabId) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  useEffect(() => {
    if (!tabParam) {
      setSearchParams({ tab: 'worldcup' }, { replace: true });
    }
  }, [tabParam, setSearchParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet('/api/channels'),
      apiGet('/api/channels/featured'),
      apiGet('/api/channels/groups'),
    ])
      .then(([allData, featuredData, groupsData]) => {
        setChannels(allData.channels || []);
        setFeatured(featuredData.channels || []);
        setGroups(groupsData.groups || []);
      })
      .catch((err) => {
        console.error('Failed to load channels:', err);
        setError('Could not load channels. Please check your connection and try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!search.trim() || search.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = search.toLowerCase();
    const matches = channels
      .filter((ch) => ch.name && ch.name.toLowerCase().includes(q))
      .slice(0, 6);
    setSearchSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [search, channels]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredChannels = channels.filter((ch) => {
    let matchGroup = true;
    if (activeGroup !== 'All') {
      if (activeGroup === 'Entertainment') {
        matchGroup = ch.group && (
          ch.group.toLowerCase().includes('movies')
          || ch.group.toLowerCase().includes('music')
          || ch.group.toLowerCase().includes('entertainment')
        );
      } else {
        matchGroup = ch.group && ch.group.toLowerCase().includes(activeGroup.toLowerCase());
      }
    }
    const matchSearch =
      !search
      || (ch.name && ch.name.toLowerCase().includes(search.toLowerCase()))
      || (ch.group && ch.group.toLowerCase().includes(search.toLowerCase()));
    return matchGroup && matchSearch;
  });

  if (loading) {
    return (
      <div className="page-container space-y-8">
        <div className="skeleton rounded-2xl h-64 w-full" />
        <div className="channel-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={`skel-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container flex min-h-[50vh] flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20 mb-4">
          <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="type-h2 text-[var(--text-primary)]">Unable to load channels</h2>
        <p className="type-body mt-2 max-w-md text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page-container space-y-7 sm:space-y-10">
      <section className="relative overflow-hidden rounded-2xl min-h-[220px] sm:min-h-[280px] md:min-h-[360px] flex items-center">
        <div className="absolute inset-0 bg-[url('/stadium-bg.jpg')] bg-cover bg-center" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/95 via-[var(--bg-primary)]/70 to-[var(--bg-primary)]/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)]/80 to-transparent" />

        <div className="relative z-10 px-5 py-10 sm:px-8 sm:py-14 md:py-20 md:px-14">
          <div className="max-w-xl">
            <h1 className="type-display text-2xl text-[var(--text-primary)] sm:text-4xl md:text-5xl lg:text-6xl">
              Live Sports{' '}
              <span className="hero-gradient-text">Streaming</span>
            </h1>
            <p className="type-body mt-3 text-[var(--text-secondary)] max-w-md sm:mt-4 sm:text-lg">
              Your home for live sports, anytime, anywhere.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
              <Link
                to="/?tab=worldcup"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97] shadow-lg shadow-[var(--accent)]/20 sm:gap-2.5 sm:px-7 sm:py-3.5 sm:text-base"
              >
                <span aria-hidden="true">🏆</span>
                FIFA World Cup
              </Link>
              <Link
                to="/category/Sports"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent-muted)] px-4 py-2.5 text-sm font-bold text-[var(--accent-light)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.97] sm:gap-2.5 sm:px-7 sm:py-3.5 sm:text-base"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Sports
              </Link>
              <Link
                to="/category/Live"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.97] sm:gap-2.5 sm:px-7 sm:py-3.5 sm:text-base"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Live TV
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 sm:flex sm:justify-center">
        <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-2.5 no-scrollbar sm:inline-flex sm:gap-3 sm:overflow-visible sm:px-4 sm:py-3">
          {PRIMARY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveGroup(cat)}
              className={`shrink-0 min-h-[44px] whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:px-5 sm:py-2 sm:text-sm ${
                activeGroup === cat
                  ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-primary)] no-scrollbar" role="tablist">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative shrink-0 min-h-[44px] whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors sm:px-5 sm:py-3 ${
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

      {activeTab === 'channels' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm" ref={searchRef}>
              <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                placeholder="Search channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                aria-label="Search channels"
                className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 z-[var(--z-dropdown)] mt-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden">
                  {searchSuggestions.map((ch) => (
                    <Link
                      key={ch.url || ch.name}
                      to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                      onClick={() => setShowSuggestions(false)}
                      className="flex w-full min-h-[44px] items-center gap-3 px-4 py-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <span className="flex-1 truncate">{ch.name}</span>
                      <span className="type-caption text-[var(--text-muted)]">{ch.group?.replace('Z_', '')}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <span className="type-body text-[var(--text-muted)]">
              {filteredChannels.length} channels
            </span>
          </div>

          {activeGroup === 'All' && !search && featured.length > 0 && (
            <section>
              <h2 className="type-h2 mb-4 text-[var(--text-primary)] sm:mb-5">
                Featured Channels
              </h2>
              <div className="channel-grid">
                {featured.slice(0, 4).map((ch) => (
                  <ChannelCard key={ch.url || ch.name} channel={ch} featured />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="type-h2 mb-4 text-[var(--text-primary)] sm:mb-5">
              {activeGroup === 'All' ? 'All Channels' : activeGroup}
            </h2>
            {filteredChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg className="h-14 w-14 text-[var(--text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="type-body text-[var(--text-muted)]">No channels found</p>
                <button
                  type="button"
                  onClick={() => { setSearch(''); setActiveGroup('All'); }}
                  className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--accent)] hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="channel-grid">
                {filteredChannels.map((ch) => (
                  <ChannelCard key={ch.url || ch.name} channel={ch} />
                ))}
              </div>
            )}
          </section>

          {activeGroup === 'All' && !search && filteredChannels.length > 12 && (
            <div className="flex justify-center pt-4">
              <Link
                to="/category/Sports"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-8 py-3 text-sm font-bold text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/30 hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)]"
              >
                View All Channels
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      )}

      {activeTab === 'worldcup' && (
        <div className="animate-fadeIn">
          <Suspense fallback={<TabLoader />}>
            <WorldCupSection />
          </Suspense>
        </div>
      )}

      {activeTab === 'scores' && (
        <div className="animate-fadeIn">
          <Suspense fallback={<TabLoader />}>
            <LiveScoresSection />
          </Suspense>
        </div>
      )}

      <div className="h-4 md:h-0" />
    </div>
  );
}