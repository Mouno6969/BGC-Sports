import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';

function ChannelTile({ channel }) {
  return (
    <Link
      to={`/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}&source=fifa`}
      className="card-sports group block overflow-hidden border-yellow-500/20 hover:border-yellow-500/50"
      aria-label={`Watch ${channel.name}`}
    >
      <div className="relative aspect-video bg-gradient-to-br from-yellow-900/20 to-red-900/20">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="absolute inset-0 h-full w-full object-contain p-4"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-40" aria-hidden="true">🏆</div>
        )}
        <span className="absolute top-2 right-2">
          <LiveBadge />
        </span>
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500 text-black shadow-lg">
            <svg className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="type-h3 truncate text-[var(--text-primary)] group-hover:text-yellow-400 transition-colors">
          {channel.name}
        </p>
        <p className="type-caption text-[var(--text-muted)] mt-0.5">{channel.providerLabel || 'FIFA Live'}</p>
      </div>
    </Link>
  );
}

export default function FifaLiveSection() {
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    apiGet('/api/fifa/channels')
      .then((data) => {
        if (!mounted) return;
        setGroups(data.groups || []);
        setTotal(data.count || 0);
      })
      .catch(() => {
        if (mounted) {
          setGroups([]);
          setTotal(0);
          setError('FIFA channels are temporarily unavailable. Try again shortly.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="channel-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`skel-${i}`} className="skeleton aspect-video rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-yellow-500/20 bg-[var(--bg-card)] p-6 text-center">
        <p className="type-body text-[var(--text-secondary)]">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-[44px] text-sm font-semibold text-yellow-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (total === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="type-h2 text-[var(--text-primary)]">Watch FIFA Live</h3>
          <p className="type-caption text-[var(--text-muted)]">
            BeIN, FIFA+, TYC Sports & more — plays on this site, no setup needed
          </p>
        </div>
        <LiveBadge label={`${total} LIVE`} />
      </div>

      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <h4 className="type-label text-yellow-500/80">{group.label}</h4>
          <div className="channel-grid">
            {group.channels.map((channel) => (
              <ChannelTile key={channel.id} channel={channel} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}