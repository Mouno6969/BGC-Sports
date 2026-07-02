import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';

export default function ToffeeSection() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    apiGet('/api/toffee/channels')
      .then((res) => {
        if (mounted && res.ok) {
          setChannels(res.channels || []);
        }
      })
      .catch((err) => {
        if (mounted) setError('Failed to load Toffee channels');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[var(--accent)]/20 animate-pulse" />
          <div className="h-5 w-40 bg-[var(--bg-tertiary)] rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-xl bg-[var(--bg-tertiary)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || channels.length === 0) {
    return null; // Silently hide if no channels or error
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500 text-white shadow">
            <span className="text-lg">📺</span>
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">Toffee Live</h2>
            <p className="text-xs text-[var(--text-muted)]">Popular Bangladeshi live channels • Updated automatically</p>
          </div>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 font-medium">
          {channels.length} LIVE
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {channels.slice(0, 12).map((channel, index) => (
          <Link
            key={index}
            to={`/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`}
            className="group block overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] transition-all hover:border-orange-500/40 hover:shadow-lg active:scale-[0.985]"
          >
            <div className="relative aspect-video bg-black">
              {channel.logo ? (
                <img 
                  src={channel.logo} 
                  alt={channel.name}
                  className="absolute inset-0 h-full w-full object-contain p-4 bg-[#111]" 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-900/30 to-red-900/30">
                  <span className="text-4xl opacity-40">📺</span>
                </div>
              )}
              
              {/* Live badge */}
              <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </div>
            </div>
            
            <div className="p-3">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                {channel.name}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Toffee • HD</p>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-center text-[10px] text-[var(--text-muted)]">
        Streams require special headers • Powered by Toffee bypass data
      </p>
    </section>
  );
}
