// ---------------------------------------------------------------------------
// ChannelCard — Large, clean card design matching the ESPN/DAZN mockup.
// Big logo area, channel name, category tag. No fake viewer counts.
// Shared-element View Transition: thumbnail morphs into the watch player.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { logoUrl } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';
import {
  armChannelMediaTransition,
  channelMediaVtStyle,
  isActiveChannelTransition,
  onActiveChannelTransition,
} from '../lib/viewTransitions.js';

export default function ChannelCard({ channel, featured, pitch }) {
  const channelUrl = channel?.url || '';
  const mediaRef = useRef(null);
  const [shareMedia, setShareMedia] = useState(() =>
    isActiveChannelTransition(channelUrl)
  );
  const [logoFailed, setLogoFailed] = useState(false);

  // Reverse morph (watch → list): re-apply name when this card is the active one.
  useEffect(() => {
    setShareMedia(isActiveChannelTransition(channelUrl));
    return onActiveChannelTransition((key) => {
      setShareMedia(key === String(channelUrl).trim());
    });
  }, [channelUrl]);

  useEffect(() => {
    setLogoFailed(false);
  }, [channel?.logo]);

  if (!channel) return null;

  const logoSrc = channel.logo ? logoUrl(channel.logo) : '';
  const isLive = channel.group?.toLowerCase() === 'live'
    || (channel.name || '').toLowerCase().includes('live');
  const initial = (channel.name || 'TV').trim().charAt(0).toUpperCase() || 'TV';

  // NOTE: navigation keeps explicit query params (several channels share the
  // same name as stream backups, so a name-derived slug can't disambiguate
  // them). Pretty slug deep links (/watch/:slug) are used for SHARING — see
  // WatchPartyRoom invite generation — where the backend verifies the slug
  // resolves to the same stream before upgrading the URL.
  const watchUrl = `/watch?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&logo=${encodeURIComponent(channel.logo || '')}`;

  const arm = () => {
    armChannelMediaTransition(channel.url, mediaRef.current);
    setShareMedia(true);
  };

  return (
    <Link
      to={watchUrl}
      viewTransition
      onPointerDown={arm}
      onFocus={arm}
      className={`${pitch ? 'pitch-card' : 'card-sports'} group block overflow-hidden`}
      aria-label={`Watch ${channel.name}`}
    >
      <div
        ref={mediaRef}
        className={`relative aspect-[4/3] flex items-center justify-center overflow-hidden ${pitch ? 'bg-gradient-to-br from-[#4c1d95]/90 to-[#1e1033]/95' : 'bg-[var(--bg-tertiary)]'}`}
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-muted)] text-2xl font-black text-[var(--accent)] ring-1 ring-[var(--border-primary)] sm:h-20 sm:w-20 sm:text-3xl">
              {initial}
            </div>
            <span className="type-caption max-w-[80%] truncate text-[var(--text-muted)]">{channel.name}</span>
          </div>
        )}

        {isLive && (
          <span className="absolute top-2 right-2 sm:top-3 sm:right-3">
            <LiveBadge />
          </span>
        )}

        {/* Play overlay — always visible on touch, hover on desktop */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-100 transition-all duration-200 sm:bg-black/30 sm:opacity-0 sm:group-hover:opacity-100">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-xl sm:h-14 sm:w-14 sm:group-hover:scale-110 transition-transform ${pitch ? 'bg-[var(--brand-purple)] shadow-[var(--brand-purple)]/30' : 'bg-[var(--accent)] shadow-[var(--accent)]/30'}`}>
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
          {channel.group && (
            <span className="type-caption rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] px-2 py-0.5 font-medium text-[var(--text-muted)] sm:px-2.5">
              {channel.group.replace('Z_', '')}
            </span>
          )}
          {featured && (
            <span className="type-caption rounded-md bg-[var(--accent-muted)] border border-[var(--accent)]/20 px-2 py-0.5 font-semibold text-[var(--accent)] sm:px-2.5">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
