// ---------------------------------------------------------------------------
// WatchPage — One-screen watch experience: the stream, the Watch Party
// (voice/video call grid + room chat), and Live Chat share the viewport on
// both desktop and mobile via a tabbed panel. Fit-to-screen (theater mode)
// hides all text chat while any active call keeps running in the background
// (a floating pill exposes quick mic/leave controls).
//
// Mobile layout notes:
//   • Stream is sticky under the site header so chat / party / related can
//     scroll while the video stays on screen.
//   • Soft-keyboard open: Visual Viewport API pins the stream to the top of
//     the visible area and docks the active chat panel underneath so the
//     typing box never sits under the keyboard (Messenger-style).
//   • Primary tabs (Chat / Party / AI) are large; secondary chrome collapses.
//   • Landscape pure-stream mode hides chat until swipe-up.
//   • Leaving the page keeps a floating mini-player via watchSession.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '../lib/config.js';
import { reportStreamError, addBreadcrumb } from '../lib/errorTracker.js';
import {
  isToffeeStream,
  isMobileDevice,
  prepareToffeePlayback,
  createToffeeHlsConfig,
} from '../lib/toffee.js';
import { resolvePlaybackUrl, needsServerProxy, isEmbedPlaybackUrl } from '../lib/playback.js';
import { getStoredUsername } from '../lib/utils.js';
import {
  parsePartyCode,
  withPartyParam,
  withoutPartyParam,
  resolveInviteUrl,
} from '../lib/watchInvite.js';
import { setWatchSession } from '../lib/watchSession.js';
import useWatchTracker from '../hooks/useWatchTracker.js';
import LiveBadge from '../components/LiveBadge.jsx';
import StreamOfflineFallback from '../components/StreamOfflineFallback.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useVisualViewportKeyboard } from '../hooks/useVisualViewportKeyboard.js';
import { showToast } from '../components/Toast.jsx';
import {
  WatchPageSkeleton,
  PanelSkeleton,
  PlayerSkeleton,
} from '../components/Skeleton.jsx';
import {
  armChannelMediaTransition,
  channelMediaVtStyle,
  setActiveChannelTransition,
} from '../lib/viewTransitions.js';

const Chat = lazy(() => import('../components/Chat.jsx'));
const AiChat = lazy(() => import('../components/AiChat.jsx'));
const WatchPartyRoom = lazy(() => import('../components/WatchPartyRoom.jsx'));
const LiveCommentary = lazy(() => import('../components/LiveCommentary.jsx'));

// Tab switcher for Live / Party / Chat / AI. Mobile uses large primary pills;
// desktop keeps the compact sidebar style. Panels stay mounted so WebRTC
// never drops on tab switch.
function PanelTabs({ active, onChange, showCommentary = false, compact = false }) {
  const tabs = [
    showCommentary && {
      id: 'live',
      short: 'Live',
      label: 'Live',
      icon: (
        <svg className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
    },
    {
      id: 'chat',
      short: 'Chat',
      label: compact ? 'Live Chat' : 'Chat',
      icon: (
        <svg className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      id: 'party',
      short: 'Party',
      label: compact ? 'Watch Party' : 'Party',
      icon: (
        <svg className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'ai',
      short: 'AI',
      label: compact ? 'BGC AI' : 'AI',
      icon: (
        <img src="/bgc-ai-logo.png" alt="" className={compact ? 'h-4 w-4 rounded-full' : 'h-5 w-5 rounded-full'} />
      ),
    },
  ].filter(Boolean);

  if (!compact) {
    // Mobile: big primary action bar
    return (
      <div className="watch-primary-tabs" role="tablist" aria-label="Watch actions">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-haptic="selection"
            data-haptic-tab="1"
            aria-selected={active === t.id}
            onClick={() => onChange(t.id)}
            className={`watch-primary-tabs__btn ${active === t.id ? 'is-active' : ''}`}
          >
            <span className="watch-primary-tabs__icon" aria-hidden="true">{t.icon}</span>
            <span className="watch-primary-tabs__label">{t.short}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex w-full gap-0.5 rounded-t-xl border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 p-1 sm:gap-1"
      role="tablist"
      aria-label="Watch sidebar"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2.5 text-[10px] font-bold transition-all sm:gap-1.5 sm:px-2 sm:text-xs ${
            active === t.id
              ? 'bg-[var(--bg-secondary)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--border-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <span className="shrink-0">{t.icon}</span>
          <span className="truncate">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function WatchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { slug } = useParams();
  // Watch Together deep link: /watch/:slug?party=ABC123
  const invitePartyCode = parsePartyCode(searchParams);

  // Channel resolved from a deep-link slug (/watch/:slug). Query params still
  // take precedence so existing /watch?url=... links keep working unchanged.
  const [slugChannel, setSlugChannel] = useState(null);
  const [slugStatus, setSlugStatus] = useState(slug ? 'loading' : 'idle'); // idle | loading | resolved | notfound

  useEffect(() => {
    if (!slug || searchParams.get('url')) {
      setSlugStatus(slug ? 'resolved' : 'idle');
      return;
    }
    let alive = true;
    setSlugStatus('loading');
    apiGet(`/api/channels/by-slug/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (!alive) return;
        if (data?.channel?.url) {
          setSlugChannel(data.channel);
          setSlugStatus('resolved');
        } else {
          setSlugStatus('notfound');
        }
      })
      .catch(() => {
        if (alive) setSlugStatus('notfound');
      });
    return () => { alive = false; };
  }, [slug, searchParams]);

  const url = searchParams.get('url') || slugChannel?.url || '';
  const name = searchParams.get('name') || slugChannel?.name || 'Live Stream';
  const logo = searchParams.get('logo') || slugChannel?.logo || '';
  const source = searchParams.get('source') || slugChannel?.source || '';
  const streamType = searchParams.get('type') || slugChannel?.type || '';
  // Keep shared-element key aligned so reverse morph (player → card) works.
  useEffect(() => {
    if (url) setActiveChannelTransition(url);
  }, [url]);
  const isEmbed = isEmbedPlaybackUrl(url, streamType);
  const isToffee = !isEmbed && isToffeeStream(url, source);
  const isServerProxied = !isEmbed && needsServerProxy(url, source, streamType);
  // World Cup channels get the live play-by-play commentary panel
  const isWorldCupStream = useMemo(() => {
    const s = String(source || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    const g = String(slugChannel?.group || '').toLowerCase();
    return (
      s === 'fifa'
      || s === 'iptv-org'
      || /world.?cup|fifa|tsn|tudn|bein|deportes|sony ten|eurosport/i.test(n)
      || /world.?cup/i.test(g)
    );
  }, [source, name, slugChannel?.group]);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [headersReady, setHeadersReady] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [playbackReady, setPlaybackReady] = useState(false);
  const [relatedChannels, setRelatedChannels] = useState([]);
  const [fallbackAlternatives, setFallbackAlternatives] = useState([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitToScreen, setFitToScreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState({ url: '', title: '', text: '', code: '' });
  const [showMoreChannels, setShowMoreChannels] = useState(false);
  // Landscape pure-stream: video fills screen; swipe up peeks chat panel.
  const [landscapeLocked, setLandscapeLocked] = useState(false);
  const [landscapeChatPeek, setLandscapeChatPeek] = useState(false);
  const isLandscape = useMediaQuery('(orientation: landscape) and (max-height: 520px)');
  const username = getStoredUsername() || 'Guest';

  // Quality state
  const [availableLevels, setAvailableLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Volume state — start unmuted at full player volume so device volume
  // controls how loud the stream is (not forced silent by default).
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Stream brightness (CSS filter) — left-side vertical swipe. 1 = normal.
  const [brightness, setBrightness] = useState(1);
  const brightnessRef = useRef(1);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);

  // Vertical swipe gestures on the player: left = brightness, right = volume.
  // Works in normal, fit-to-screen, and fullscreen (handlers live on container).
  const gestureRef = useRef({
    active: false,
    mode: null, // 'volume' | 'brightness'
    startY: 0,
    startX: 0,
    startValue: 0,
    pointerId: null,
    tracking: false,
  });

  // Controls visibility
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef(null);

  // Active tab (live | party | chat | ai) for the side/under-video panel.
  // Invite links open Watch Party; World Cup channels default to Live commentary.
  // Default: Live commentary on World Cup streams, else Watch Party.
  // Invite deep links always open the party tab.
  const [activePanel, setActivePanel] = useState(() =>
    invitePartyCode ? 'party' : 'chat'
  );
  // lg breakpoint — must match Tailwind `lg:` (1024px). Hook initializes from
  // the real viewport so desktop users get the right-hand panel on first paint.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // Theater mode = fit-to-screen: text chat hides, calls keep running.
  const theater = fitToScreen;

  // Keep party tab focused when landing from an invite deep link
  useEffect(() => {
    if (invitePartyCode) setActivePanel('party');
  }, [invitePartyCode]);

  // Default mobile to Chat (primary social action); WC streams → Live; invites → Party
  useEffect(() => {
    if (invitePartyCode) {
      setActivePanel('party');
      return;
    }
    if (isWorldCupStream) setActivePanel('live');
    else setActivePanel((prev) => {
      if (prev === 'live' || prev === 'party') return 'chat';
      return prev;
    });
  }, [isWorldCupStream, invitePartyCode, url]);

  // Record watch history + time + badges while this channel is open
  useWatchTracker(
    url
      ? {
          name,
          url,
          logo,
          source,
          slug: slug || slugChannel?.slug || '',
          group: slugChannel?.group || '',
        }
      : null,
    { isPlaying: isPlaying || loading, partyCode: invitePartyCode }
  );

  // Sync ?party=CODE into the URL so the address bar itself is shareable.
  // replace: true avoids polluting history when creating/joining/leaving.
  const handlePartyCodeChange = useCallback(
    (code) => {
      setSearchParams(
        (prev) => (code ? withPartyParam(prev, code) : withoutPartyParam(prev)),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const channelSlug = slug || slugChannel?.slug || '';

  // Mobile/tablet: keep the stream sticky while scrolling chat/party options,
  // and pin it to the visual viewport when the soft keyboard opens so it never
  // gets cut off under the keyboard or scrolled away.
  const { keyboardOpen, visualHeight, visualWidth } = useVisualViewportKeyboard({
    enabled: !isDesktop,
  });

  // Pure stream cinema: phone landscape (or user-locked landscape) hides chrome.
  const landscapePure = !isDesktop && (isLandscape || landscapeLocked) && !keyboardOpen;

  // Persist watch session for mini-player when user browses scores / Match Center
  useEffect(() => {
    if (!url) return undefined;
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '';
    setWatchSession({
      url,
      name,
      logo,
      source,
      type: streamType,
      slug: channelSlug,
      party: invitePartyCode || '',
      path,
    });
    // Do not clear on unmount — mini-player continues until user closes it.
  }, [url, name, logo, source, streamType, channelSlug, invitePartyCode]);

  // Body class for landscape pure mode (Layout hides header / bottom nav)
  useEffect(() => {
    document.body.classList.toggle('watch-landscape-pure', Boolean(landscapePure));
    return () => document.body.classList.remove('watch-landscape-pure');
  }, [landscapePure]);

  // Reset chat peek when leaving landscape pure
  useEffect(() => {
    if (!landscapePure) setLandscapeChatPeek(false);
  }, [landscapePure]);

  // Swipe up from bottom edge in landscape pure → reveal chat panel
  useEffect(() => {
    if (!landscapePure || isDesktop) return undefined;
    let startY = 0;
    let startX = 0;
    let tracking = false;

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      startY = t.clientY;
      startX = t.clientX;
      tracking = true;
    };
    const onMove = (e) => {
      if (!tracking) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = startY - t.clientY;
      const dx = Math.abs(t.clientX - startX);
      // Swipe up from lower third of screen
      if (dy > 48 && dx < 80 && startY > window.innerHeight * 0.55) {
        setLandscapeChatPeek(true);
        tracking = false;
      }
      // Swipe down on peek panel area → hide
      if (dy < -48 && dx < 80 && landscapeChatPeek) {
        setLandscapeChatPeek(false);
        tracking = false;
      }
    };
    const onEnd = () => { tracking = false; };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [landscapePure, isDesktop, landscapeChatPeek]);

  const openShareSheet = useCallback(async (opts) => {
    // Ignore synthetic click events when used as onClick={openShareSheet}
    const o = opts && typeof opts === 'object' && !opts.nativeEvent ? opts : {};
    const party = o.code || invitePartyCode || '';
    let shareUrl = o.url || (typeof window !== 'undefined' ? window.location.href : '');
    if (party) {
      shareUrl = await resolveInviteUrl(party, {
        channelSlug,
        channelName: name,
        streamUrl: url,
      });
    }
    setSharePayload({
      url: shareUrl,
      title: o.title || (name ? `Watch ${name} together` : 'Watch Together on BGC Sports'),
      text: o.text
        || (party
          ? `Join my watch party (${party}) on BGC Sports — open the link to watch and join:`
          : `Watch ${name || 'live'} on BGC Sports:`),
      code: party || '',
    });
    setShareOpen(true);
  }, [invitePartyCode, channelSlug, name, url]);

  const toggleLandscapePure = useCallback(async () => {
    if (landscapeLocked || landscapePure) {
      setLandscapeLocked(false);
      setLandscapeChatPeek(false);
      try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch { /* ignore */ }
      showToast('Chat unlocked', 'info');
      return;
    }
    setLandscapeLocked(true);
    setLandscapeChatPeek(false);
    try {
      if (isMobileDevice() && screen.orientation?.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch { /* browser may require fullscreen for lock */ }
    showToast('Cinema mode — swipe up for chat', 'success');
  }, [landscapeLocked, landscapePure]);

  // Keyboard open: fixed small strip — rest of (resized) viewport is chat.
  const playerHeightPx = useMemo(() => {
    if (!keyboardOpen) {
      const w = visualWidth || (typeof window !== 'undefined' ? window.innerWidth : 360);
      return Math.round((w * 9) / 16);
    }
    const h = visualHeight || (typeof window !== 'undefined' ? window.innerHeight : 400);
    // Leave most of the space for messages + composer
    return Math.min(120, Math.max(88, Math.round(h * 0.22)));
  }, [visualWidth, visualHeight, keyboardOpen]);

  useEffect(() => {
    if (keyboardOpen) {
      document.documentElement.style.setProperty('--player-height', `${playerHeightPx}px`);
    } else {
      document.documentElement.style.removeProperty('--player-height');
    }
    return () => {
      document.documentElement.style.removeProperty('--player-height');
    };
  }, [keyboardOpen, playerHeightPx]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [resetHideTimer]);

  /**
   * Start playback with sound at the current volume level.
   * Browsers may block unmuted autoplay — if so we briefly play muted so
   * the stream still loads, then unmute on the next user gesture.
   */
  const playWithSound = useCallback(async (video) => {
    if (!video) return;
    const vol = volumeRef.current;
    video.volume = vol;
    video.muted = false;
    setMuted(false);

    try {
      await video.play();
      return;
    } catch {
      // Autoplay with sound blocked — fall back to muted so video starts,
      // then unlock audio on the first tap/click/keypress.
    }

    try {
      video.muted = true;
      setMuted(true);
      await video.play();
    } catch {
      return;
    }

    const unlock = () => {
      if (!videoRef.current) return;
      videoRef.current.muted = false;
      videoRef.current.volume = volumeRef.current;
      setMuted(false);
      videoRef.current.play().catch(() => {});
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
    window.addEventListener('touchstart', unlock, { capture: true, once: true });
  }, []);

  // Resolve playback URL — FIFA streams go through on-site HLS proxy; Toffee
  // channels go through the toffee CDN proxy with session headers (still on-site).
  // Official embeds (btvlive) play in an iframe with the viewer's own IP.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function resolve() {
      setLoading(true);
      setError(null);

      if (isEmbed) {
        setSourceUrl(url);
        setPlaybackReady(true);
        setHeadersReady(true);
        setLoading(false);
        setIsPlaying(true);
        return;
      }

      if (isToffee) {
        try {
          // Pull fresh headers from backend catalog when possible
          let channelHeaders = {};
          try {
            const data = await apiGet('/api/toffee/channels');
            const match = (data.channels || []).find((ch) => ch.url === url);
            if (match?.headers) channelHeaders = match.headers;
          } catch { /* optional */ }

          const { sourceUrl: toffeeUrl } = await prepareToffeePlayback(url, channelHeaders);
          if (cancelled) return;
          setSourceUrl(toffeeUrl || url);
          setPlaybackReady(true);
          setHeadersReady(true);
        } catch (err) {
          console.error('[watch] toffee prepare failed:', err);
          if (!cancelled) {
            reportStreamError({
              message: 'Toffee stream prepare failed',
              url,
              channelName: name,
              channelId: slugChannel?.id,
              error: err instanceof Error ? err : undefined,
              details: err?.message || String(err),
            });
            setError('This Toffee stream is temporarily offline.');
            setLoading(false);
            setPlaybackReady(false);
            setHeadersReady(true);
          }
        }
        return;
      }

      if (isServerProxied) {
        const proxied = resolvePlaybackUrl(url, source, streamType);
        setSourceUrl(proxied || url);
      } else {
        setSourceUrl(url);
      }
      setPlaybackReady(true);
      setHeadersReady(true);
    }

    resolve();
    return () => { cancelled = true; };
  }, [url, isEmbed, isToffee, isServerProxied, source, streamType, retryKey]);

  // Load HLS stream (hls.js loaded on demand) — skip for official embeds
  useEffect(() => {
    if (isEmbed) return;
    if (!url || !headersReady || !playbackReady || !sourceUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let loadTimeout;

    setError(null);
    setLoading(true);
    setAvailableLevels([]);
    setCurrentLevel(-1);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    loadTimeout = setTimeout(() => {
      if (!cancelled) {
        reportStreamError({
          message: 'Stream load timeout',
          url: sourceUrl || url,
          channelName: name,
          channelId: slugChannel?.id,
          type: 'timeout',
        });
        setError('Stream timed out — the source may be offline.');
        setLoading(false);
      }
    }, isMobileDevice() ? 30000 : 20000);

    async function startPlayback() {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hlsConfig = isToffee
            ? createToffeeHlsConfig()
            : isServerProxied
              ? {
                  lowLatencyMode: false,
                  enableWorker: false,
                  maxBufferSize: 60 * 1024 * 1024,
                  maxBufferLength: 60,
                  fragLoadingMaxRetry: 6,
                  manifestLoadingMaxRetry: 4,
                  levelLoadingMaxRetry: 4,
                }
              : {
                  lowLatencyMode: true,
                  enableWorker: true,
                  maxBufferSize: 30 * 1024 * 1024,
                  maxBufferLength: 30,
                };

          const hls = new Hls(hlsConfig);
          hlsRef.current = hls;
          hls.loadSource(sourceUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            const levels = hls.levels.map((level, idx) => ({
              index: idx,
              height: level.height,
              width: level.width,
              bitrate: level.bitrate,
              label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`,
            }));
            setAvailableLevels(levels);
            video.volume = volumeRef.current;
            video.muted = false;
            playWithSound(video);
          });

          hls.on(Hls.Events.FRAG_LOADED, () => {
            if (cancelled) return;
            clearTimeout(loadTimeout);
            setLoading(false);
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => { setCurrentLevel(data.level); });

          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal || cancelled) return;
            clearTimeout(loadTimeout);
            console.error('[watch] HLS fatal error:', data.type, data.details, data.response?.code);
            reportStreamError({
              message: `HLS fatal: ${data.details || data.type || 'unknown'}`,
              url: sourceUrl || url,
              channelName: name,
              channelId: slugChannel?.id,
              type: data.type,
              details: data,
              fatal: true,
            });
            setError(
              isToffee || isServerProxied
                ? 'This stream is temporarily offline. Try another World Cup channel.'
                : 'Stream unavailable — the source may be offline or geo-restricted.'
            );
            setLoading(false);
            if (!isToffee) apiPost('/api/channels/report-dead', { url }).catch(() => {});
          });
          addBreadcrumb('stream', 'hls load', {
            channel: name || '',
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = sourceUrl;
          video.addEventListener('loadeddata', () => {
            if (cancelled) return;
            clearTimeout(loadTimeout);
            setLoading(false);
            video.volume = volumeRef.current;
            video.muted = false;
            playWithSound(video);
          }, { once: true });
          video.addEventListener('error', () => {
            if (cancelled) return;
            clearTimeout(loadTimeout);
            reportStreamError({
              message: 'Native HLS playback failed',
              url: sourceUrl || url,
              channelName: name,
              channelId: slugChannel?.id,
              type: 'native',
            });
            setError('Playback failed. Try another channel.');
            setLoading(false);
          }, { once: true });
        } else {
          reportStreamError({
            message: 'HLS not supported in this browser',
            url: sourceUrl || url,
            type: 'unsupported',
          });
          setError('HLS playback is not supported in this browser.');
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        clearTimeout(loadTimeout);
        console.error('[watch] HLS init failed:', err);
        reportStreamError({
          message: 'HLS player init failed',
          url: sourceUrl || url,
          channelName: name,
          channelId: slugChannel?.id,
          error: err instanceof Error ? err : undefined,
        });
        setError('Failed to start player. Please try again.');
        setLoading(false);
      }
    }

    startPlayback();

    return () => {
      cancelled = true;
      clearTimeout(loadTimeout);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, sourceUrl, playbackReady, headersReady, isEmbed, isToffee, isServerProxied, retryKey, playWithSound]);

  // (retryKey already forces playback re-resolve above)

  // Load alternative channels when stream fails
  useEffect(() => {
    if (!error) {
      setFallbackAlternatives([]);
      return;
    }
    let alive = true;
    setAlternativesLoading(true);

    Promise.all([
      apiGet('/api/fifa/channels').catch(() => ({ channels: [] })),
      apiGet('/api/channels/sports').catch(() => ({ channels: [] })),
    ])
      .then(([fifaData, sportsData]) => {
        if (!alive) return;
        const pool = [
          ...(fifaData.channels || []).map((ch) => ({ ...ch, source: 'fifa' })),
          ...(sportsData.channels || []),
        ];
        const seen = new Set([url]);
        const picks = [];
        for (const ch of pool) {
          if (!ch?.url || seen.has(ch.url)) continue;
          seen.add(ch.url);
          picks.push(ch);
          if (picks.length >= 3) break;
        }
        setFallbackAlternatives(picks);
      })
      .finally(() => {
        if (alive) setAlternativesLoading(false);
      });

    return () => { alive = false; };
  }, [error, url]);

  function retryStream() {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }

  // Load related channels
  useEffect(() => {
    const endpoint = source === 'fifa' ? '/api/fifa/channels' : '/api/channels/sports';
    apiGet(endpoint)
      .then((data) => {
        const related = (data.channels || []).filter((ch) => ch.url !== url).sort(() => Math.random() - 0.5).slice(0, 6);
        setRelatedChannels(related);
      })
      .catch(() => {});
  }, [url, source]);

  // Track play state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => { video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); };
  }, []);

  const switchQuality = (levelIndex) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
    setShowQualityMenu(false);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // User gesture — resume at the user's current volume/mute preference.
      video.volume = volumeRef.current;
      video.muted = mutedRef.current;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const lockLandscape = useCallback(async () => {
    if (!isMobileDevice()) return;
    try { if (screen.orientation?.lock) await screen.orientation.lock('landscape'); } catch {}
  }, []);

  const unlockOrientation = useCallback(() => {
    try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {}
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      try {
        if (container.requestFullscreen) await container.requestFullscreen();
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        else if (videoRef.current?.webkitEnterFullscreen) videoRef.current.webkitEnterFullscreen();
        setIsFullscreen(true);
        await lockLandscape();
      } catch {}
    } else {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch {}
      unlockOrientation();
      setIsFullscreen(false);
    }
  };

  const toggleFitToScreen = () => setFitToScreen((prev) => !prev);

  const applyVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    volumeRef.current = clamped;
    const video = videoRef.current;
    if (video) {
      video.volume = clamped;
      const shouldMute = clamped === 0;
      video.muted = shouldMute;
      mutedRef.current = shouldMute;
      setMuted(shouldMute);
    }
  }, []);

  const applyBrightness = useCallback((b) => {
    // 0.15 floor so the picture never goes fully black mid-gesture.
    const clamped = Math.max(0.15, Math.min(2, b));
    setBrightness(clamped);
    brightnessRef.current = clamped;
  }, []);

  const handleVolumeChange = (e) => {
    applyVolume(parseFloat(e.target.value));
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !muted;
    videoRef.current.muted = newMuted;
    // When unmuting, restore volume if it was zeroed.
    if (!newMuted && videoRef.current.volume === 0) {
      applyVolume(volume > 0 ? volume : 1);
    }
    mutedRef.current = newMuted;
    setMuted(newMuted);
  };

  // ── Player edge gestures (no UI chrome) ────────────────────────────────
  // Vertical drag on the RIGHT half  → volume up/down
  // Vertical drag on the LEFT half   → brightness up/down
  // Native touch + pointer listeners (passive:false) so iOS/Android reliably
  // capture vertical swipes in normal, fit-to-screen, and fullscreen modes.
  const gestureLayerRef = useRef(null);

  useEffect(() => {
    const layer = gestureLayerRef.current;
    const container = containerRef.current;
    if (!layer || !container) return undefined;

    const getPoint = (e) => {
      if (e.touches && e.touches.length) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY, id: e.touches[0].identifier };
      }
      if (e.changedTouches && e.changedTouches.length) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, id: e.changedTouches[0].identifier };
      }
      return { x: e.clientX, y: e.clientY, id: e.pointerId ?? 1 };
    };

    const onStart = (e) => {
      // Ignore multi-touch and secondary mouse buttons.
      if (e.touches && e.touches.length > 1) return;
      if (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const pt = getPoint(e);
      const mode = (pt.x - rect.left) < rect.width / 2 ? 'brightness' : 'volume';

      gestureRef.current = {
        active: false,
        mode,
        startY: pt.y,
        startX: pt.x,
        startValue: mode === 'volume' ? volumeRef.current : brightnessRef.current,
        pointerId: pt.id,
        tracking: true,
      };

      if (e.pointerId != null && layer.setPointerCapture) {
        try { layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    };

    const onMove = (e) => {
      const g = gestureRef.current;
      if (!g.tracking) return;
      const pt = getPoint(e);
      if (g.pointerId != null && pt.id != null && g.pointerId !== pt.id) return;

      const rect = container.getBoundingClientRect();
      const dy = g.startY - pt.y; // up = increase
      const dx = pt.x - g.startX;

      if (!g.active) {
        if (Math.abs(dy) < 6) return;
        // Need a clearly vertical gesture.
        if (Math.abs(dy) < Math.abs(dx) * 1.15) {
          g.tracking = false;
          return;
        }
        g.active = true;
        if (g.mode === 'volume' && mutedRef.current) g.startValue = 0;
        setShowControls(false);
        clearTimeout(hideTimer.current);
      }

      // Block page scroll while adjusting.
      if (e.cancelable) e.preventDefault();

      const range = Math.max(rect.height, 120);
      const delta = dy / range;
      if (g.mode === 'volume') applyVolume(g.startValue + delta);
      else applyBrightness(g.startValue + delta * 1.25);
    };

    const onEnd = (e) => {
      const g = gestureRef.current;
      if (!g.tracking) return;
      if (e.pointerId != null && g.pointerId != null && e.pointerId !== g.pointerId) return;
      g.tracking = false;
      g.active = false;
      g.pointerId = null;
      if (e.pointerId != null && layer.releasePointerCapture) {
        try { layer.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    };

    // Prefer Pointer Events when available (covers mouse + touch without double-firing).
    // Fall back to Touch Events on older browsers. Always non-passive so we can
    // preventDefault and stop the page from scrolling while adjusting.
    const opts = { passive: false, capture: true };
    const usePointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    if (usePointer) {
      layer.addEventListener('pointerdown', onStart, opts);
      layer.addEventListener('pointermove', onMove, opts);
      layer.addEventListener('pointerup', onEnd, opts);
      layer.addEventListener('pointercancel', onEnd, opts);
      layer.addEventListener('lostpointercapture', onEnd, opts);
    } else {
      layer.addEventListener('touchstart', onStart, opts);
      layer.addEventListener('touchmove', onMove, opts);
      layer.addEventListener('touchend', onEnd, opts);
      layer.addEventListener('touchcancel', onEnd, opts);
    }

    return () => {
      if (usePointer) {
        layer.removeEventListener('pointerdown', onStart, opts);
        layer.removeEventListener('pointermove', onMove, opts);
        layer.removeEventListener('pointerup', onEnd, opts);
        layer.removeEventListener('pointercancel', onEnd, opts);
        layer.removeEventListener('lostpointercapture', onEnd, opts);
      } else {
        layer.removeEventListener('touchstart', onStart, opts);
        layer.removeEventListener('touchmove', onMove, opts);
        layer.removeEventListener('touchend', onEnd, opts);
        layer.removeEventListener('touchcancel', onEnd, opts);
      }
    };
  }, [applyVolume, applyBrightness, loading, error, isFullscreen, fitToScreen]);

  useEffect(() => {
    const handler = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(fs);
      if (!fs) unlockOrientation();
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
      unlockOrientation();
    };
  }, [unlockOrientation]);

  // Resolving a deep-link slug — full watch-page skeleton (content-shaped)
  if (!url && slug && slugStatus === 'loading') {
    return <WatchPageSkeleton />;
  }

  // Slug didn't resolve — friendly not-found screen. If the link carried a
  // party code, keep it usable by offering /watch?party=CODE so the invitee
  // can still join the room from any channel.
  if (!url && slug && slugStatus === 'notfound') {
    const partyCode = invitePartyCode;
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/20">
            <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Channel Not Found</h2>
          <p className="text-sm text-[var(--text-muted)]">This channel link is no longer available. It may have been renamed or removed.</p>
          {partyCode && (
            <p className="text-xs text-[var(--text-muted)]">
              Your watch party code <span className="font-mono font-bold text-[var(--accent)]">{partyCode}</span> is still valid — pick any channel and join with it.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to="/" className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95 transition-transform">
              Browse Channels
            </Link>
            {partyCode && (
              <Link
                to={`/watch?party=${encodeURIComponent(partyCode)}`}
                className="mt-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-muted)] px-4 py-2 text-sm font-bold text-[var(--accent)] active:scale-95 transition-transform"
              >
                Keep party {partyCode}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No URL state
  if (!url) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-purple-muted)] ring-1 ring-[var(--brand-purple)]/30">
            <svg className="h-7 w-7 text-[var(--brand-purple-light)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold text-white">No Channel Selected</h2>
          <p className="text-sm text-slate-300">Choose a channel from the homepage to start watching.</p>
          <Link to="/" className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 active:scale-95 transition-transform">
            Browse Channels
          </Link>
        </div>
      </div>
    );
  }

  const currentQualityLabel = currentLevel === -1 ? 'Auto' : availableLevels[currentLevel]?.label || 'Auto';

  const hideSecondaryChrome = keyboardOpen || landscapePure;

  return (
    <div className={`page-container max-w-[1600px] py-0 md:py-4 !px-0 md:!px-4 lg:!px-6 ${landscapePure ? 'watch-page--landscape-pure' : ''}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">

        {/* ── Left Column: Video + Info + Watch Party + Related ── */}
        <div className="flex-1 min-w-0 space-y-0 md:space-y-3">

          {/* Video Player — sticky on mobile. With soft keyboard open it becomes
              a fixed top strip; chat docks under it in the remaining visible area. */}
          {keyboardOpen && !isFullscreen && !landscapePure && (
            <div className="player-keyboard-spacer lg:hidden" aria-hidden="true" />
          )}
          <div
            ref={containerRef}
            data-player-container
            className={[
              'player-container relative w-full overflow-hidden rounded-none sm:rounded-xl bg-black shadow-lg ring-0 sm:ring-1 ring-[var(--border-primary)]',
              !isFullscreen && !landscapePure ? 'player-sticky-mobile' : '',
              keyboardOpen && !isFullscreen && !landscapePure ? 'player-keyboard-pinned' : '',
              landscapePure ? 'player-landscape-pure' : '',
              isFullscreen ? 'is-fullscreen' : '',
            ].filter(Boolean).join(' ')}
            style={channelMediaVtStyle(Boolean(url) && !isFullscreen && !landscapePure)}
            onMouseMove={(e) => {
              // Don't flash controls mid-gesture.
              if (!gestureRef.current.active) resetHideTimer();
            }}
            onTouchStart={() => {
              if (!gestureRef.current.active) resetHideTimer();
            }}
          >
            {isEmbed ? (
              <iframe
                title={name || 'BTV Live'}
                src={sourceUrl || url}
                className="player-video h-full w-full border-0 bg-black"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => {
                  setLoading(false);
                  setIsPlaying(true);
                }}
              />
            ) : (
              <video
                ref={videoRef}
                className={`player-video h-full w-full ${fitToScreen ? 'object-cover' : 'object-contain'}`}
                style={{ filter: `brightness(${brightness})` }}
                playsInline
                autoPlay
                muted={muted}
              />
            )}

            {/* Invisible gesture surface: left half = brightness, right half = volume.
                No icons/labels. Sits under the control bar so buttons stay clickable.
                Works in fit-to-screen and fullscreen (same container). */}
            {!isEmbed && !loading && !error && (
              <div
                ref={gestureLayerRef}
                className="player-gesture-layer absolute inset-0 z-[5]"
                aria-hidden="true"
              />
            )}

            {/* Loading overlay — player-shaped skeleton */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20"
                >
                  <PlayerSkeleton />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error overlay */}
            {error && !loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/92 p-4">
                <StreamOfflineFallback
                  channelName={name}
                  alternatives={fallbackAlternatives}
                  loading={alternativesLoading}
                  onRetry={retryStream}
                  compact
                />
              </div>
            )}


            {/* Custom Controls Overlay */}
            <AnimatePresence>
              {showControls && !loading && !error && !isEmbed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-0 left-0 right-0 z-10"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
                  <div className="relative flex items-center gap-1.5 px-2 py-2 md:px-4 md:py-3">
                    {/* Play/Pause */}
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-all active:scale-90"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>

                    {/* Mute/Unmute — always visible on all devices */}
                    <button
                      onClick={toggleMute}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-all active:scale-90"
                      aria-label={muted ? 'Unmute' : 'Mute'}
                    >
                      {muted || volume === 0 ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      )}
                    </button>

                    {/* Volume slider — desktop only */}
                    <div className="hidden sm:flex items-center">
                      <input
                        type="range"
                        min="0" max="1" step="0.05"
                        value={muted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-14 h-1 accent-emerald-400 cursor-pointer"
                      />
                    </div>

                    <div className="flex-1" />

                    {/* Quality Selector */}
                    <div className="relative">
                      <button
                        onClick={() => setShowQualityMenu((v) => !v)}
                        className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white transition-all active:scale-95"
                        title="Video Quality"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {currentQualityLabel}
                      </button>
                      <AnimatePresence>
                        {showQualityMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className="absolute bottom-full right-0 mb-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden min-w-[120px]"
                          >
                            <button
                              onClick={() => switchQuality(-1)}
                              className={`flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-tertiary)] ${currentLevel === -1 ? 'text-[var(--accent)]' : 'text-white'}`}
                            >
                              Auto
                              {currentLevel === -1 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                            </button>
                            {availableLevels.map((level) => (
                              <button
                                key={level.index}
                                onClick={() => switchQuality(level.index)}
                                className={`flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-tertiary)] ${currentLevel === level.index ? 'text-[var(--accent)]' : 'text-white'}`}
                              >
                                {level.label}
                                {currentLevel === level.index && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                              </button>
                            ))}
                            {availableLevels.length === 0 && (
                              <div className="px-3 py-1.5 text-[9px] text-[var(--text-muted)]">Single quality stream</div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Fit to Screen */}
                    <button
                      onClick={toggleFitToScreen}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-90 ${fitToScreen ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'bg-black/60 text-white'}`}
                      title={fitToScreen ? 'Exit theater mode' : 'Fit to screen (theater mode)'}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </button>

                    {/* Landscape / cinema pure stream (mobile) */}
                    {!isDesktop && (
                      <button
                        type="button"
                        onClick={toggleLandscapePure}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-90 ${landscapePure ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'bg-black/60 text-white'}`}
                        title={landscapePure ? 'Exit cinema mode' : 'Cinema — pure stream (landscape)'}
                        aria-pressed={landscapePure}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}

                    {/* PiP (native) + mini-player works when leaving page */}
                    {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                      <button
                        onClick={async () => {
                          if (!videoRef.current) return;
                          try {
                            if (document.pictureInPictureElement) await document.exitPictureInPicture();
                            else await videoRef.current.requestPictureInPicture();
                          } catch (e) { console.warn('PiP error:', e); }
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-all active:scale-90"
                        title="Picture-in-Picture"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M13 17h8v-5h-8v5z" />
                        </svg>
                      </button>
                    )}

                    {/* Fullscreen */}
                    <button
                      onClick={toggleFullscreen}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-all active:scale-90"
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Compact channel strip — secondary chrome collapsed on mobile */}
          {!hideSecondaryChrome && (
            <div className="watch-channel-strip mx-3 mt-1.5 flex items-center gap-2 sm:mx-0 sm:mt-2">
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-sm font-bold text-white drop-shadow sm:text-base">{name}</h1>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <LiveBadge />
                  {availableLevels.length > 0 && (
                    <span className="text-[10px] text-[var(--text-muted)]">{currentQualityLabel}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={openShareSheet}
                className="flex h-10 min-w-[44px] items-center gap-1.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-muted)] px-3 text-xs font-bold text-[var(--accent)] transition-colors active:scale-95"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>{invitePartyCode ? 'Invite' : 'Share'}</span>
              </button>
            </div>
          )}

          {/* Landscape pure: swipe-up hint */}
          {landscapePure && !landscapeChatPeek && (
            <button
              type="button"
              className="watch-landscape-hint"
              onClick={() => setLandscapeChatPeek(true)}
              aria-label="Show chat — swipe up"
            >
              <span className="watch-landscape-hint__bar" />
              <span className="text-[10px] font-semibold text-white/80">Swipe up for Chat · Party · AI</span>
            </button>
          )}

          {/* ── Mobile / tablet: big Chat / Party / AI primary tabs + panels.
              Keyboard: fixed shell under stream. Landscape pure: peek overlay. */}
          {!isDesktop && (
          <>
          {keyboardOpen && !landscapePure && (
            <div className="watch-panel-keyboard-flow-spacer lg:hidden" aria-hidden="true" />
          )}
          <div
            className={[
              'lg:hidden',
              keyboardOpen || (landscapePure && landscapeChatPeek) ? 'mt-0' : 'mx-3 mt-2 sm:mx-0',
              landscapePure && !landscapeChatPeek ? 'hidden' : '',
              landscapePure && landscapeChatPeek ? 'watch-landscape-peek' : '',
            ].filter(Boolean).join(' ')}
          >
            <div
              className={[
                'scene-card overflow-hidden',
                theater && !landscapeChatPeek ? '!border-0 !bg-transparent !shadow-none' : '',
                keyboardOpen ? 'watch-panel-keyboard-shell' : '',
                landscapePure && landscapeChatPeek ? 'watch-landscape-peek__panel' : '',
              ].filter(Boolean).join(' ')}
            >
              {landscapePure && landscapeChatPeek && (
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Swipe down to hide
                  </span>
                  <button
                    type="button"
                    onClick={() => setLandscapeChatPeek(false)}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--accent)]"
                  >
                    Back to stream
                  </button>
                </div>
              )}
              <div className={theater || keyboardOpen ? 'hidden' : ''}>
                <PanelTabs
                  active={activePanel}
                  onChange={(id) => {
                    setActivePanel(id);
                    if (landscapePure) setLandscapeChatPeek(true);
                  }}
                  showCommentary={isWorldCupStream}
                  compact={false}
                />
              </div>
              {isWorldCupStream && (
                <div className={`h-full min-h-0 ${activePanel === 'live' && !theater ? '' : 'hidden'}`}>
                  <div className={keyboardOpen ? 'watch-panel-keyboard' : 'h-[min(52vh,420px)] min-h-[280px]'}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <LiveCommentary />
                    </Suspense>
                  </div>
                </div>
              )}
              <div className={`h-full min-h-0 ${activePanel === 'party' || theater ? '' : 'hidden'}`}>
                <div
                  className={
                    theater && !landscapeChatPeek
                      ? ''
                      : `h-full overflow-y-auto scrollbar-thin p-2 ${keyboardOpen ? 'watch-panel-keyboard' : 'max-h-[min(55vh,480px)]'}`
                  }
                >
                  <Suspense fallback={<PanelSkeleton />}>
                    <WatchPartyRoom
                      partyCode={invitePartyCode}
                      theater={theater && !landscapeChatPeek}
                      channelSlug={channelSlug}
                      channelName={name}
                      streamUrl={url}
                      onPartyCodeChange={handlePartyCodeChange}
                      onOpenShareSheet={openShareSheet}
                    />
                  </Suspense>
                </div>
              </div>
              <div className={`h-full min-h-0 ${activePanel === 'chat' && !(theater && !landscapeChatPeek) ? '' : 'hidden'}`}>
                <div className={keyboardOpen ? 'watch-panel-keyboard' : 'h-[min(52vh,420px)] min-h-[280px]'}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <Chat />
                  </Suspense>
                </div>
              </div>
              <div className={`h-full min-h-0 ${activePanel === 'ai' && !(theater && !landscapeChatPeek) ? '' : 'hidden'}`}>
                <div className={keyboardOpen ? 'watch-panel-keyboard' : 'h-[min(52vh,420px)] min-h-[280px]'}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <AiChat />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
          </>
          )}

          {/* Related Channels — collapsed by default on mobile */}
          {relatedChannels.length > 0 && !theater && !hideSecondaryChrome && (
            <section className="mx-3 space-y-2 sm:mx-0">
              <button
                type="button"
                onClick={() => setShowMoreChannels((v) => !v)}
                className="scene-row flex w-full items-center justify-between px-3 py-2.5 text-left sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none"
              >
                <h3 className="font-display text-sm font-bold text-white">More Sports Channels</h3>
                <span className="text-xs font-semibold text-[var(--brand-purple-light)] sm:hidden">
                  {showMoreChannels ? 'Hide' : 'Show'}
                </span>
              </button>
              <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${showMoreChannels ? '' : 'hidden sm:grid'}`}>
                {relatedChannels.map((ch) => (
                  <Link
                    key={ch.url || ch.name}
                    to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}&source=${encodeURIComponent(source || '')}`}
                    viewTransition
                    onPointerDown={() => armChannelMediaTransition(ch.url)}
                    className="scene-row flex items-center gap-2 p-2 transition-all active:scale-[0.98]"
                  >
                    <div className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-[#4c1d95]/70 to-[#1e1033]/80">
                      {ch.logo && ch.logo.startsWith('http') ? (
                        <img src={ch.logo} alt={ch.name} className="h-full w-full object-contain p-0.5" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <svg className="h-3 w-3 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[10px] font-bold text-white">{ch.name}</p>
                      <LiveBadge className="scale-90 origin-left" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right Column (desktop ≥1024px): Live / Watch Party / Live Chat /
            BGC AI. Uses both JS (isDesktop) and Tailwind `lg:` so the sidebar
            cannot disappear if the media-query hook is briefly wrong. */}
        {isDesktop && (
          <aside
            className={`hidden lg:block shrink-0 transition-all duration-300 ${theater ? 'w-0 overflow-visible' : 'w-[380px] min-w-[320px]'}`}
            aria-label="Watch sidebar"
          >
            <div className="sticky top-[88px]">
              <div className={`scene-card flex flex-col overflow-hidden ${theater ? 'h-auto !border-0 !bg-transparent !shadow-none' : 'h-[calc(100vh-108px)] min-h-[480px]'}`}>
                <div className={theater ? 'hidden' : 'shrink-0'}>
                  <PanelTabs
                    active={activePanel}
                    onChange={setActivePanel}
                    showCommentary={isWorldCupStream}
                    compact
                  />
                </div>
                {/* World Cup live commentary — desktop */}
                {isWorldCupStream && (
                  <div className={`flex-1 min-h-0 overflow-hidden ${activePanel === 'live' && !theater ? '' : 'hidden'}`}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <LiveCommentary />
                    </Suspense>
                  </div>
                )}
                {/* Watch Party tab — the single desktop instance, never unmounted.
                    In theater mode WatchPartyRoom hides itself and shows the
                    floating call pill instead, so calls keep running. */}
                <div className={`${theater ? '' : 'flex-1 overflow-y-auto scrollbar-thin p-2'} ${activePanel === 'party' || theater ? '' : 'hidden'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <WatchPartyRoom
                      partyCode={invitePartyCode}
                      theater={theater}
                      channelSlug={channelSlug}
                      channelName={name}
                      streamUrl={url}
                      onPartyCodeChange={handlePartyCodeChange}
                      onOpenShareSheet={openShareSheet}
                    />
                  </Suspense>
                </div>
                {/* Live Chat tab — hidden entirely in theater mode */}
                <div className={`flex-1 overflow-hidden ${activePanel === 'chat' && !theater ? '' : 'hidden'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <Chat />
                  </Suspense>
                </div>
                {/* BGC AI chatroom tab — hidden entirely in theater mode */}
                <div className={`flex-1 overflow-hidden ${activePanel === 'ai' && !theater ? '' : 'hidden'}`}>
                  <Suspense fallback={<PanelSkeleton />}>
                    <AiChat />
                  </Suspense>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom padding for mobile nav — less when nav collapsed, none with keyboard */}
      {!keyboardOpen && !landscapePure && (
        <div
          className="h-16 md:h-0 bottom-nav-page-pad"
          aria-hidden="true"
        />
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={sharePayload.url}
        title={sharePayload.title}
        text={sharePayload.text}
        code={sharePayload.code}
      />
    </div>
  );
}
