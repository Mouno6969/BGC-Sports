// ---------------------------------------------------------------------------
// CategoryPage — Shows channels filtered by group/category.
// Redesigned to match the landing page: stadium backdrop, glass hero banner
// with purple gradient title, glass filter pills + search, pitch channel cards.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import ChannelCard from '../components/ChannelCard.jsx';
import StadiumGrassScene from '../components/StadiumGrassScene.jsx';
import { ChannelGridSkeleton } from '../components/Skeleton.jsx';

const CATEGORY_INFO = {
  Sports: {
    title: 'Sports',
    highlight: 'Channels',
    description: 'Watch live sports including Cricket, Football, NBA, FIFA, Tennis and more.',
  },
  Live: {
    title: 'Live',
    highlight: 'Channels',
    description: 'Currently broadcasting live streams — IPL, Premier League, and more.',
  },
  Bangla: {
    title: 'Bangla',
    highlight: 'Channels',
    description: 'Popular Bangladeshi TV channels including news, entertainment, and drama.',
  },
  News: {
    title: 'News',
    highlight: 'Channels',
    description: 'Stay updated with international and local news channels.',
  },
  Kids: {
    title: 'Kids',
    highlight: 'Channels',
    description: 'Fun and educational content for children.',
  },
  Religious: {
    title: 'Religious',
    highlight: 'Channels',
    description: 'Islamic, Quran, and other religious programming.',
  },
  Indian: {
    title: 'Indian',
    highlight: 'Channels',
    description: 'Popular Indian TV channels and entertainment.',
  },
  Movies: {
    title: 'Movie',
    highlight: 'Channels',
    description: 'Watch movies and cinema channels.',
  },
};

export default function CategoryPage() {
  const { group } = useParams();
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const info = CATEGORY_INFO[group] || {
    title: group,
    highlight: 'Channels',
    description: `Browse ${group} channels.`,
  };

  useEffect(() => {
    let alive = true;
    const load = ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      return apiGet(`/api/channels?group=${encodeURIComponent(group)}`)
        .then((data) => {
          if (!alive) return;
          setChannels(data.channels || []);
          setError(null);
        })
        .catch(() => {
          if (!alive) return;
          if (!silent) {
            setError('Failed to load channels for this category.');
            setChannels([]);
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };

    load();
    const onPull = () => load({ silent: true });
    window.addEventListener('bgc:pull-refresh', onPull);
    return () => {
      alive = false;
      window.removeEventListener('bgc:pull-refresh', onPull);
    };
  }, [group]);

  const filtered = search
    ? channels.filter((ch) => ch.name && ch.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  return (
    <StadiumGrassScene>
      <div className="page-container space-y-5">
        <nav className="flex items-center gap-2 type-caption text-slate-300" aria-label="Breadcrumb">
          <Link to="/" viewTransition className="hover:text-[var(--brand-purple-light)]">Home</Link>
          <span aria-hidden="true">/</span>
          <span className="text-[var(--brand-purple-light)]">{group}</span>
        </nav>

        {/* Hero banner — glass card matching landing hero language */}
        <section className="scene-card relative overflow-hidden p-5 sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(ellipse 80% 90% at 15% 0%, rgba(168, 85, 247, 0.22) 0%, transparent 60%)',
            }}
            aria-hidden="true"
          />
          <div className="relative z-10">
            <h1 className="type-display text-3xl text-white drop-shadow-lg sm:text-4xl">
              {info.title} <span className="hero-gradient-text">{info.highlight}</span>
            </h1>
            <p className="type-body mt-2 max-w-lg text-slate-200/90">{info.description}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-[var(--live-red-muted)] px-3 py-1.5 shadow-[var(--live-glow)]">
              <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500" />
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-red-300">
                {channels.length} channels
              </span>
            </div>
          </div>
        </section>

        {/* Search — glass input with purple focus ring */}
        <div className="relative max-w-md">
          <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder={`Search ${group} channels...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${group} channels`}
            className="scene-input py-3 pl-11 pr-4 text-sm"
          />
        </div>

        {loading ? (
          <ChannelGridSkeleton count={10} pitch />
        ) : error ? (
          <div className="scene-card flex flex-col items-center justify-center py-16 text-center">
            <p className="type-body text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-transform active:scale-[0.97]"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="scene-card flex flex-col items-center justify-center py-16">
            <p className="type-body text-slate-300">No channels found</p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-4 min-h-[44px] text-sm font-semibold text-[var(--brand-purple-light)] hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="channel-grid">
            {filtered.map((ch) => (
              <ChannelCard key={ch.url || ch.name} channel={ch} pitch />
            ))}
          </div>
        )}

        <div className="h-14 md:h-2" />
      </div>
    </StadiumGrassScene>
  );
}
