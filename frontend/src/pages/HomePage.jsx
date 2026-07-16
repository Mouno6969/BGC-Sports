// ---------------------------------------------------------------------------
// HomePage — Immersive stadium + grass scene matching the reference mockup
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';
import StadiumGrassScene from '../components/StadiumGrassScene.jsx';
import {
  ChannelGridSkeleton,
  WorldCupSectionSkeleton,
  ScoresSectionSkeleton,
  PredictionSectionSkeleton,
} from '../components/Skeleton.jsx';
import { armChannelMediaTransition } from '../lib/viewTransitions.js';

const WorldCupSection = lazy(() => import('../components/WorldCupSection.jsx'));
const LiveScoresSection = lazy(() => import('../components/LiveScoresSection.jsx'));
const PredictionLeaderboard = lazy(() => import('../components/PredictionLeaderboard.jsx'));

const MAIN_TABS = [
  { id: 'predict', label: 'Predictions' },
  { id: 'scores', label: 'Live scores' },
  { id: 'worldcup', label: 'World Cup' },
  { id: 'channels', label: 'Channels' },
];

const PRIMARY_CATEGORIES = ['All', 'Sports', 'Live', 'News', 'Entertainment'];

const HERO_COPY = {
  predict: {
    kicker: 'Live matchday',
    title: 'Call the score',
    accent: 'before kickoff.',
    description: 'Set your predictions, follow the result, and climb the BGC table without losing sight of the match.',
    metricLabel: 'Prediction desk',
    metricValue: 'OPEN',
  },
  scores: {
    kicker: 'Matchday signal',
    title: 'Every goal,',
    accent: 'as it happens.',
    description: 'Follow live scorelines, match status, and the next fixtures from one focused broadcast desk.',
    metricLabel: 'Score feed',
    metricValue: 'LIVE',
  },
  worldcup: {
    kicker: 'Tournament watch',
    title: 'Every nation.',
    accent: 'One signal.',
    description: 'Track the World Cup, move from fixtures to standings, and open the match center without breaking focus.',
    metricLabel: 'World Cup',
    metricValue: 'ON',
  },
  channels: {
    kicker: 'Channel control',
    title: 'Find the match.',
    accent: 'Start watching.',
    description: 'Search live sports and entertainment channels through a faster, cleaner match-night interface.',
    metricLabel: 'Channel grid',
    metricValue: 'READY',
  },
};

function HomeContent({
  activeTab,
  setActiveTab,
  activeGroup,
  setActiveGroup,
  search,
  setSearch,
  searchRef,
  showSuggestions,
  setShowSuggestions,
  searchSuggestions,
  filteredChannels,
  featured,
}) {
  const hero = HERO_COPY[activeTab] || HERO_COPY.predict;

  return (
    <>
      <section className="home-hero signal-hero">
        <div className="home-hero__content signal-hero__content">
          <span className="signal-hero__kicker">
            <span className="signal-hero__pulse" aria-hidden="true" />
            {hero.kicker}
          </span>
          <h1 className="signal-hero__title type-display">
            {hero.title}<br />
            <span>{hero.accent}</span>
          </h1>
          <p className="signal-hero__description">{hero.description}</p>
          <div className="home-hero__actions signal-hero__actions">
            <Link to="/?tab=predict" className="btn-hero-primary">
              <span className="signal-target" aria-hidden="true" />
              Make a prediction
            </Link>
            <Link to="/?tab=scores" className="btn-hero-secondary">
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l2-6 4 12 3-9 2 3h4" />
              </svg>
              View live scores
            </Link>
          </div>
        </div>
        <div className="signal-hero__metric" aria-label={`${hero.metricLabel}: ${hero.metricValue}`}>
          <span>{hero.metricLabel}</span>
          <strong>{hero.metricValue}</strong>
        </div>
      </section>

      <section className="home-pitch signal-workspace">
        <div className="home-pitch__inner">
          <div className="home-tabs no-scrollbar" role="tablist">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-haptic="selection"
                data-haptic-tab="1"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`home-tabs__btn ${activeTab === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'channels' && (
            <div className="home-section-stack animate-fadeIn">
              <div className="-mx-1 flex justify-center sm:mx-0">
                <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-white/10 bg-black/30 px-2.5 py-2.5 no-scrollbar sm:inline-flex sm:gap-3 sm:px-4 sm:py-3 backdrop-blur-sm">
                  {PRIMARY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveGroup(cat)}
                      className={`shrink-0 min-h-[44px] whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:px-5 sm:py-2 sm:text-sm ${
                        activeGroup === cat
                          ? 'bg-[var(--brand-purple)] text-white shadow-md shadow-[var(--brand-purple)]/25'
                          : 'text-slate-200 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-sm" ref={searchRef}>
                  <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search channels..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                    aria-label="Search channels"
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-400 focus:border-[var(--brand-purple)] focus:ring-2 focus:ring-[var(--brand-purple)]/25 backdrop-blur-sm"
                  />
                  {showSuggestions && (
                    <div className="absolute top-full left-0 right-0 z-[var(--z-dropdown)] mt-2 rounded-xl border border-white/10 bg-[var(--bg-secondary)] shadow-xl overflow-hidden">
                      {searchSuggestions.map((ch) => (
                        <Link
                          key={ch.url || ch.name}
                          to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                          viewTransition
                          onPointerDown={() => armChannelMediaTransition(ch.url)}
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
                <span className="type-body text-slate-200">
                  {filteredChannels.length} channels
                </span>
              </div>

              {activeGroup === 'All' && !search && featured.length > 0 && (
                <section>
                  <h2 className="type-h2 mb-3 text-white drop-shadow">
                    Featured Channels
                  </h2>
                  <div className="channel-grid">
                    {featured.slice(0, 4).map((ch) => (
                      <ChannelCard key={ch.url || ch.name} channel={ch} featured pitch />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="type-h2 mb-3 text-white drop-shadow">
                  {activeGroup === 'All' ? 'All Channels' : activeGroup}
                </h2>
                {filteredChannels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <svg className="h-14 w-14 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="type-body text-slate-200">No channels found</p>
                    <button
                      type="button"
                      onClick={() => { setSearch(''); setActiveGroup('All'); }}
                      className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--brand-purple-light)] hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="channel-grid">
                    {filteredChannels.map((ch) => (
                      <ChannelCard key={ch.url || ch.name} channel={ch} pitch />
                    ))}
                  </div>
                )}
              </section>

              {activeGroup === 'All' && !search && filteredChannels.length > 12 && (
                <div className="flex justify-center pt-4">
                  <Link
                    to="/category/Sports"
                    viewTransition
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-8 py-3 text-sm font-bold text-slate-100 transition-all hover:border-[var(--brand-purple)]/40 hover:text-white backdrop-blur-sm"
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
            <div className="animate-fadeIn text-white">
              <Suspense fallback={<WorldCupSectionSkeleton />}>
                <WorldCupSection pitch />
              </Suspense>
            </div>
          )}

          {activeTab === 'scores' && (
            <div className="animate-fadeIn">
              <Suspense fallback={<ScoresSectionSkeleton />}>
                <LiveScoresSection />
              </Suspense>
            </div>
          )}

          {activeTab === 'predict' && (
            <div className="animate-fadeIn text-white">
              <Suspense fallback={<PredictionSectionSkeleton />}>
                <PredictionLeaderboard pitch />
              </Suspense>
            </div>
          )}

          <div className="h-2" />
        </div>
      </section>
    </>
  );
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [activeGroup, setActiveGroup] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  const tabParam = searchParams.get('tab');
  const activeTab = MAIN_TABS.some((t) => t.id === tabParam) ? tabParam : 'predict';

  const setActiveTab = (tabId) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  useEffect(() => {
    if (!tabParam) {
      setSearchParams({ tab: 'predict' }, { replace: true });
    }
  }, [tabParam, setSearchParams]);

  useEffect(() => {
    let alive = true;
    const loadChannels = ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      return Promise.all([
        apiGet('/api/channels'),
        apiGet('/api/channels/featured'),
        apiGet('/api/channels/groups'),
      ])
        .then(([allData, featuredData]) => {
          if (!alive) return;
          setChannels(allData.channels || []);
          setFeatured(featuredData.channels || []);
          setError(null);
        })
        .catch((err) => {
          console.error('Failed to load channels:', err);
          if (!alive) return;
          if (!silent) {
            setError('Could not load channels. Please check your connection and try again.');
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };

    loadChannels();
    const onPull = () => loadChannels({ silent: true });
    window.addEventListener('bgc:pull-refresh', onPull);
    return () => {
      alive = false;
      window.removeEventListener('bgc:pull-refresh', onPull);
    };
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

  if (error) {
    return (
      <StadiumGrassScene>
        <div className="page-container flex min-h-[50vh] flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20 mb-4">
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="type-h2 text-white">Unable to load channels</h2>
          <p className="type-body mt-2 max-w-md text-slate-200">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white"
          >
            Retry
          </button>
        </div>
      </StadiumGrassScene>
    );
  }

  return (
    <StadiumGrassScene>
      {loading ? (
        <div className="home-pitch">
          <div className="home-pitch__inner space-y-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-9 w-20 rounded-full" />
              ))}
            </div>
            <ChannelGridSkeleton count={8} pitch />
          </div>
        </div>
      ) : (
        <HomeContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          search={search}
          setSearch={setSearch}
          searchRef={searchRef}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          searchSuggestions={searchSuggestions}
          filteredChannels={filteredChannels}
          featured={featured}
        />
      )}
    </StadiumGrassScene>
  );
}