// ---------------------------------------------------------------------------
// HomePage — cinematic live-sports landing experience.
// ---------------------------------------------------------------------------
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
  { id: 'worldcup', label: 'World Cup' },
  { id: 'predict', label: 'Predict' },
  { id: 'channels', label: 'Channels' },
  { id: 'scores', label: 'Live Scores' },
];

const PRIMARY_CATEGORIES = ['All', 'Sports', 'Live', 'News', 'Entertainment'];

function TrophyIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6H5v1a4 4 0 0 0 4 4m7-5h3v1a4 4 0 0 1-4 4M12 12v4m-3 4h6m-5-4h4" />
    </svg>
  );
}

function PlayIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.7v12.6a1 1 0 0 0 1.54.84l9.8-6.3a1 1 0 0 0 0-1.68l-9.8-6.3A1 1 0 0 0 8 5.7Z" />
    </svg>
  );
}

function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero__inner">
        <div className="home-hero__copy">
          <div className="home-hero__eyebrow animate-hero-in">
            <span className="home-hero__live-dot" aria-hidden="true" />
            The world’s game, live now
          </div>

          <h1 id="home-hero-title" className="home-hero__title animate-hero-in">
            Every match.
            <span>One stadium.</span>
          </h1>

          <p className="home-hero__description animate-hero-in">
            Watch live football, follow real-time scores, and join the biggest
            moments from one beautifully simple sports hub.
          </p>

          <div className="home-hero__actions animate-hero-in">
            <Link to="/?tab=worldcup" className="btn-hero-primary">
              <TrophyIcon />
              Explore World Cup
            </Link>
            <Link to="/category/Sports" viewTransition className="btn-hero-secondary">
              <PlayIcon />
              Watch live sports
            </Link>
          </div>

          <dl className="home-hero__proof animate-hero-in" aria-label="Platform highlights">
            <div>
              <dt>Live channels</dt>
              <dd>50+</dd>
            </div>
            <div>
              <dt>Match updates</dt>
              <dd>Real-time</dd>
            </div>
            <div>
              <dt>Watch parties</dt>
              <dd>Together</dd>
            </div>
          </dl>
        </div>

        <aside className="home-spotlight animate-hero-in" aria-label="Featured tournament">
          <div className="home-spotlight__topline">
            <span className="home-spotlight__icon"><TrophyIcon /></span>
            <span>Featured tournament</span>
            <span className="home-spotlight__live"><i /> Live</span>
          </div>
          <p className="home-spotlight__kicker">FIFA World Cup 2026</p>
          <h2>World football has one home.</h2>
          <p className="home-spotlight__copy">
            Fixtures, live channels, group standings, and local kickoff times — all in one place.
          </p>
          <div className="home-spotlight__meta">
            <span><strong>48</strong> teams</span>
            <span><strong>104</strong> matches</span>
            <span><strong>3</strong> host nations</span>
          </div>
          <Link to="/?tab=worldcup" className="home-spotlight__link">
            Open tournament hub
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </aside>
      </div>
    </section>
  );
}

function HomeTabs({ activeTab, setActiveTab }) {
  return (
    <div className="home-tabs-wrap">
      <span className="home-tabs__label">Explore</span>
      <div className="home-tabs no-scrollbar" role="tablist" aria-label="Homepage sections">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`home-tab-${tab.id}`}
            type="button"
            role="tab"
            data-haptic="selection"
            data-haptic-tab="1"
            aria-selected={activeTab === tab.id}
            aria-controls={`home-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`home-tabs__btn ${activeTab === tab.id ? 'is-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChannelsPanel({
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
  return (
    <div className="home-section-stack animate-fadeIn">
      <div className="channel-filter-row no-scrollbar" aria-label="Channel categories">
        {PRIMARY_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveGroup(category)}
            className={`channel-filter ${activeGroup === category ? 'is-active' : ''}`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="channel-tools">
        <div className="channel-search" ref={searchRef}>
          <svg className="channel-search__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
          </svg>
          <input
            type="search"
            placeholder="Search live channels"
            value={search}
            onChange={(event) => {
              const nextSearch = event.target.value;
              setSearch(nextSearch);
              setShowSuggestions(nextSearch.trim().length >= 2);
            }}
            onFocus={() => search.trim().length >= 2 && setShowSuggestions(true)}
            aria-label="Search channels"
          />
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className="channel-search__suggestions">
              {searchSuggestions.map((channel) => (
                <Link
                  key={channel.url || channel.name}
                  to={`/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`}
                  viewTransition
                  onPointerDown={() => armChannelMediaTransition(channel.url)}
                  onClick={() => setShowSuggestions(false)}
                >
                  <span>{channel.name}</span>
                  <small>{channel.group?.replace('Z_', '')}</small>
                </Link>
              ))}
            </div>
          )}
        </div>
        <span className="channel-count">
          <i aria-hidden="true" />
          {filteredChannels.length} channels available
        </span>
      </div>

      {activeGroup === 'All' && !search && featured.length > 0 && (
        <section>
          <div className="section-heading-row">
            <div>
              <p>Curated for you</p>
              <h2>Featured channels</h2>
            </div>
            <span>Live now</span>
          </div>
          <div className="channel-grid">
            {featured.slice(0, 4).map((channel) => (
              <ChannelCard key={channel.url || channel.name} channel={channel} featured pitch />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-heading-row">
          <div>
            <p>Browse the lineup</p>
            <h2>{activeGroup === 'All' ? 'All channels' : activeGroup}</h2>
          </div>
        </div>

        {filteredChannels.length === 0 ? (
          <div className="channel-empty-state">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
            </svg>
            <h3>No channels found</h3>
            <p>Try another name or clear your active filters.</p>
            <button type="button" onClick={() => { setSearch(''); setActiveGroup('All'); }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="channel-grid">
            {filteredChannels.map((channel) => (
              <ChannelCard key={channel.url || channel.name} channel={channel} pitch />
            ))}
          </div>
        )}
      </section>

      {activeGroup === 'All' && !search && filteredChannels.length > 12 && (
        <div className="home-view-all">
          <Link to="/category/Sports" viewTransition>
            View all sports channels
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

function HomeContent(props) {
  const { activeTab, setActiveTab } = props;

  return (
    <section className="home-pitch" aria-label="Sports content">
      <div className="home-pitch__inner">
        <div className="home-content-panel">
          <HomeTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          <div
            id={`home-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`home-tab-${activeTab}`}
            className="home-content-panel__body"
          >
            {activeTab === 'channels' && <ChannelsPanel {...props} />}

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
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeLoading() {
  return (
    <section className="home-pitch" aria-label="Loading sports content">
      <div className="home-pitch__inner">
        <div className="home-content-panel home-content-panel--loading">
          <div className="flex gap-2 overflow-hidden">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton h-11 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <ChannelGridSkeleton count={8} pitch />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [activeGroup, setActiveGroup] = useState('All');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  const tabParam = searchParams.get('tab');
  const activeTab = MAIN_TABS.some((tab) => tab.id === tabParam) ? tabParam : 'worldcup';

  const setActiveTab = (tabId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabId);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!tabParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', 'worldcup');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, tabParam]);

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
        .catch((loadError) => {
          console.error('Failed to load channels:', loadError);
          if (alive && !silent) {
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
    const closeSuggestions = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('pointerdown', closeSuggestions);
    return () => document.removeEventListener('pointerdown', closeSuggestions);
  }, []);

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return channels
      .filter((channel) => channel.name?.toLowerCase().includes(query))
      .slice(0, 6);
  }, [channels, search]);

  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();

    return channels.filter((channel) => {
      let matchesGroup = true;
      const group = channel.group?.toLowerCase() || '';

      if (activeGroup !== 'All') {
        if (activeGroup === 'Entertainment') {
          matchesGroup = ['movies', 'music', 'entertainment'].some((term) => group.includes(term));
        } else {
          matchesGroup = group.includes(activeGroup.toLowerCase());
        }
      }

      const matchesSearch = !query
        || channel.name?.toLowerCase().includes(query)
        || group.includes(query);

      return matchesGroup && matchesSearch;
    });
  }, [activeGroup, channels, search]);

  return (
    <StadiumGrassScene>
      <HomeHero />

      {error ? (
        <section className="home-error" role="alert">
          <div className="home-error__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v3m0 4h.01M4.9 19h14.2a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.17 16A2 2 0 0 0 4.9 19Z" />
            </svg>
          </div>
          <h2>Unable to load channels</h2>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>Try again</button>
        </section>
      ) : loading ? (
        <HomeLoading />
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
