// ---------------------------------------------------------------------------
// FifaLiveSection — World Cup live channels as a normal channel grid.
// Same card UX as Sports / Channels tabs. Playback stays on-site via proxy
// (source=fifa → /api/hls-proxy, source=toffee → toffee proxy).
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, logoUrl } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';
import { ChannelGridSkeleton } from './Skeleton.jsx';
import {
  armChannelMediaTransition,
  channelMediaVtStyle,
  isActiveChannelTransition,
  onActiveChannelTransition,
} from '../lib/viewTransitions.js';

function WorldCupChannelCard({ channel, pitch }) {
  const logoSrc = channel.logo ? logoUrl(channel.logo) : '';
  const source = channel.source || 'fifa';
  const watchUrl =
    `/watch?url=${encodeURIComponent(channel.url)}`
    + `&name=${encodeURIComponent(channel.name)}`
    + `&logo=${encodeURIComponent(channel.logo || '')}`
    + `&source=${encodeURIComponent(source)}`
    + (channel.type ? `&type=${encodeURIComponent(channel.type)}` : '');

  const mediaRef = useRef(null);
  const [shareMedia, setShareMedia] = useState(() =>
    isActiveChannelTransition(channel.url)
  );
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setShareMedia(isActiveChannelTransition(channel.url));
    return onActiveChannelTransition((key) => {
      setShareMedia(key === String(channel.url || '').trim());
    });
  }, [channel.url]);

  useEffect(() => {
    setLogoFailed(false);
  }, [channel.logo]);

  const arm = () => {
    armChannelMediaTransition(channel.url, mediaRef.current);
    setShareMedia(true);
  };

  const initial = (channel.name || 'TV').trim().charAt(0).toUpperCase() || 'TV';

  return (
    <Link
      to={watchUrl}
      viewTransition
      onPointerDown={arm}
      onFocus={arm}
      className={`${pitch ? 'pitch-card' : 'card-sports'} group block overflow-hidden`}
      aria-label={`Watch ${channel.name} live on this site`}
    >
      <div
        ref={mediaRef}
        className={`relative aspect-[4/3] flex items-center justify-center overflow-hidden ${
          pitch
            ? 'bg-gradient-to-br from-[#4c1d95]/90 to-[#1e1033]/95'
            : 'bg-[var(--bg-tertiary)]'
        }`}
        style={channelMediaVtStyle(shareMedia)}
      >
        {logoSrc && !logoFailed ? (
          <img
            src={logoSrc}
            alt={channel.name}
            className="h-full w-full object-contain p-5 transition-transform duration-300 group-hover:scale-110 sm:p-8"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2" aria-hidden="true">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/15 text-2xl font-black text-yellow-400 ring-1 ring-yellow-500/30 sm:h-20 sm:w-20 sm:text-3xl">
              {initial}
            </div>
            <span className="type-caption max-w-[80%] truncate text-[var(--text-muted)]">
              {channel.name}
            </span>
          </div>
        )}

        <span className="absolute top-2 right-2 sm:top-3 sm:right-3">
          <LiveBadge />
        </span>

        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-100 transition-all duration-200 sm:bg-black/30 sm:opacity-0 sm:group-hover:opacity-100">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-xl sm:h-14 sm:w-14 sm:group-hover:scale-110 transition-transform ${
              pitch
                ? 'bg-[var(--brand-purple)] shadow-[var(--brand-purple)]/30'
                : 'bg-[var(--accent)] shadow-[var(--accent)]/30'
            }`}
          >
            <svg className="h-5 w-5 ml-0.5 sm:h-6 sm:w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className={`p-3 sm:p-4 ${pitch ? 'bg-black/50' : ''}`}>
        <h3 className={`type-h3 truncate ${pitch ? 'text-white' : 'text-[var(--text-primary)]'}`}>
          {channel.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-2.5 sm:gap-2">
          <span className="type-caption rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] px-2 py-0.5 font-medium text-[var(--text-muted)] sm:px-2.5">
            {channel.providerLabel || channel.group || 'World Cup'}
          </span>
          <span className="type-caption rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 font-semibold text-red-400 sm:px-2.5">
            Live
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function FifaLiveSection({ pitch = false }) {
  const [groups, setGroups] = useState([]);
  const [flatChannels, setFlatChannels] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeProvider, setActiveProvider] = useState('all');

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    // Hard client timeout so the tab never spins forever
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    async function load() {
      try {
        // No refresh=1 — backend returns curated list instantly and probes in background
        const res = await fetch('/api/fifa/channels', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setGroups(data.groups || []);
        setFlatChannels(data.channels || []);
        setTotal(data.count || 0);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        // Fallback: still try the shared apiGet (may work if abort was the only issue)
        try {
          const data = await apiGet('/api/fifa/channels');
          if (!mounted) return;
          setGroups(data.groups || []);
          setFlatChannels(data.channels || []);
          setTotal(data.count || 0);
          setError(null);
        } catch {
          if (mounted) {
            setGroups([]);
            setFlatChannels([]);
            setTotal(0);
            setError('World Cup channels are temporarily unavailable. Try again shortly.');
          }
        }
      } finally {
        clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      }
    }

    load();

    // Pull-to-refresh reloads live World Cup channel status
    const onPull = () => {
      if (!mounted) return;
      // Fresh controller for the pull — don't abort the original on unmount race
      const pullController = new AbortController();
      const pullTimeout = setTimeout(() => pullController.abort(), 12000);
      fetch('/api/fifa/channels', {
        signal: pullController.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!mounted) return;
          setGroups(data.groups || []);
          setFlatChannels(data.channels || []);
          setTotal(data.count || 0);
          setError(null);
        })
        .catch(() => {
          // keep existing list on soft refresh failure
        })
        .finally(() => clearTimeout(pullTimeout));
    };
    window.addEventListener('bgc:pull-refresh', onPull);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      controller.abort();
      window.removeEventListener('bgc:pull-refresh', onPull);
    };
  }, []);

  if (loading) {
    return <ChannelGridSkeleton count={8} />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-6 text-center">
        <p className="type-body text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 min-h-[44px] text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-6 text-center">
        <p className="type-body text-[var(--text-secondary)]">
          No live World Cup streams are reachable right now. Check back soon.
        </p>
      </div>
    );
  }

  const providerTabs = [
    { id: 'all', label: 'All' },
    ...groups.map((g) => ({ id: g.id, label: g.label })),
  ];

  const visible =
    activeProvider === 'all'
      ? flatChannels
      : flatChannels.filter((ch) => (ch.provider || 'other') === activeProvider);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className={`type-h2 ${pitch ? 'text-white' : 'text-[var(--text-primary)]'}`}>
            World Cup Channels
          </h3>
          <p className={`type-caption ${pitch ? 'text-slate-300' : 'text-[var(--text-muted)]'}`}>
            Powered by free iptv-org catalog + live probes · plays only on this site · try BeIN USA / Fox Deportes first
          </p>
        </div>
        <LiveBadge label={`${total} LIVE`} />
      </div>

      {/* Provider filter chips — same pattern as channel category pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {providerTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveProvider(tab.id)}
            className={`shrink-0 min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeProvider === tab.id
                ? pitch
                  ? 'bg-[var(--brand-purple)] text-white'
                  : 'bg-[var(--accent)] text-white'
                : pitch
                  ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="channel-grid">
        {visible.map((channel) => (
          <WorldCupChannelCard
            key={channel.id || channel.url}
            channel={channel}
            pitch={pitch}
          />
        ))}
      </div>
    </section>
  );
}
