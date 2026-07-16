// ---------------------------------------------------------------------------
// WorldCupMobileFab — mobile FAB + bottom sheet for quick FIFA access
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { apiGet, logoUrl } from '../lib/config.js';
import { FabChannelListSkeleton } from './Skeleton.jsx';
import LiveBadge from './LiveBadge.jsx';
import { armChannelMediaTransition } from '../lib/viewTransitions.js';

export default function WorldCupMobileFab() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'predict';
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);

  const isHome = location.pathname === '/';
  const hideFab = !isHome || tab !== 'channels';

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    apiGet('/api/fifa/channels')
      .then((data) => {
        if (alive) setChannels((data.channels || []).slice(0, 4));
      })
      .catch(() => {
        if (alive) setChannels([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (hideFab) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="wc-fab fixed right-4 z-[calc(var(--z-header)+2)] flex min-h-[48px] items-center gap-2 rounded-full bg-yellow-500 px-4 py-3 text-sm font-bold text-black shadow-lg shadow-yellow-500/30 transition-transform active:scale-95 md:hidden"
        aria-label="Watch FIFA World Cup"
      >
        <span aria-hidden="true">🏆</span>
        Watch FIFA
      </button>

      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] md:hidden" role="dialog" aria-modal="true" aria-label="FIFA World Cup">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="sheet-panel absolute bottom-0 left-0 right-0 max-h-[78vh] rounded-t-2xl border-t border-yellow-500/30 bg-[var(--bg-secondary)] shadow-2xl safe-area-bottom">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--border-secondary)]" aria-hidden="true" />

            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <h3 className="type-h3 text-[var(--text-primary)]">FIFA World Cup Live</h3>
                <p className="type-caption text-[var(--text-muted)]">Tap a channel — plays on this site</p>
              </div>
              <LiveBadge />
            </div>

            <div className="scrollbar-thin overflow-y-auto px-4 pb-4 space-y-2">
              {loading ? (
                <FabChannelListSkeleton count={4} />
              ) : channels.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">No FIFA channels live right now.</p>
              ) : (
                channels.map((ch) => (
                  <Link
                    key={ch.id || ch.url}
                    to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}&source=fifa${ch.type ? `&type=${encodeURIComponent(ch.type)}` : ''}`}
                    viewTransition
                    onPointerDown={() => armChannelMediaTransition(ch.url)}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-[var(--bg-tertiary)] p-3 transition-colors active:bg-[var(--bg-card-hover)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-secondary)]">
                      {ch.logo ? (
                        <img
                          src={logoUrl(ch.logo)}
                          alt=""
                          className="h-full w-full object-contain p-1"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const sib = e.currentTarget.nextElementSibling;
                            if (sib) sib.hidden = false;
                          }}
                        />
                      ) : null}
                      <span hidden={Boolean(ch.logo)}>🏆</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{ch.name}</p>
                      <p className="type-caption text-[var(--text-muted)]">{ch.providerLabel || 'FIFA Live'}</p>
                    </div>
                    <svg className="h-5 w-5 shrink-0 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </Link>
                ))
              )}

              <Link
                to="/?tab=worldcup"
                viewTransition
                onClick={() => setOpen(false)}
                className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-white"
              >
                View All World Cup
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}