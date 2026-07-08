// ---------------------------------------------------------------------------
// WatchPage — Redesigned: Video player with quality selector, fit-to-screen
// toggle, and Watch Party Room (10-user calling grid) below the video.
// Desktop: video top + watch party below. Chat panel on the right side.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '../lib/config.js';
import { isToffeeStream, isMobileDevice } from '../lib/toffee.js';
import { resolvePlaybackUrl, needsServerProxy } from '../lib/playback.js';
import { getStoredUsername } from '../lib/utils.js';
import LiveBadge from '../components/LiveBadge.jsx';
import StreamOfflineFallback from '../components/StreamOfflineFallback.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

const Chat = lazy(() => import('../components/Chat.jsx'));
const WatchPartyRoom = lazy(() => import('../components/WatchPartyRoom.jsx'));

function PanelLoader() {
  return (
    <div className="flex h-24 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
    </div>
  );
}

export default function WatchPage() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const name = searchParams.get('name') || 'Live Stream';
  const logo = searchParams.get('logo') || '';
  const source = searchParams.get('source') || '';
  const isToffee = isToffeeStream(url, source);
  const isServerProxied = needsServerProxy(url, source);
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
  const username = getStoredUsername() || 'Guest';

  // Quality state
  const [availableLevels, setAvailableLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Volume state
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);

  // Controls visibility
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef(null);

  // Chat panel visibility
  const [showChat, setShowChat] = useState(true);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [resetHideTimer]);

  // Resolve playback URL — server-proxied FIFA/gateway streams need no client setup.
  useEffect(() => {
    if (!url || isToffee) return;

    if (isServerProxied) {
      const proxied = resolvePlaybackUrl(url, source);
      setSourceUrl(proxied || url);
      setPlaybackReady(true);
      setLoading(true);
    } else {
      setSourceUrl(url);
      setPlaybackReady(true);
      setLoading(true);
    }
    setHeadersReady(true);
  }, [url, isToffee, isServerProxied, source]);

  // Load HLS stream (hls.js loaded on demand)
  useEffect(() => {
    if (!url || isToffee || !headersReady || !playbackReady || !sourceUrl) return;
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
        setError('Stream timed out — the source may be offline.');
        setLoading(false);
      }
    }, isMobileDevice() ? 30000 : 20000);

    async function startPlayback() {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hlsConfig = isServerProxied
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
            video.play().catch(() => {});
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
            setError(isServerProxied
              ? 'This stream is temporarily offline.'
              : 'Stream unavailable — the source may be offline or geo-restricted.');
            setLoading(false);
            apiPost('/api/channels/report-dead', { url }).catch(() => {});
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = sourceUrl;
          video.addEventListener('loadeddata', () => {
            if (cancelled) return;
            clearTimeout(loadTimeout);
            setLoading(false);
            video.play().catch(() => {});
          }, { once: true });
          video.addEventListener('error', () => {
            if (cancelled) return;
            clearTimeout(loadTimeout);
            setError('Playback failed. Try another channel.');
            setLoading(false);
          }, { once: true });
        } else {
          setError('HLS playback is not supported in this browser.');
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        clearTimeout(loadTimeout);
        console.error('[watch] HLS init failed:', err);
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
  }, [url, sourceUrl, playbackReady, headersReady, isToffee, isServerProxied, retryKey]);

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
    if (video.paused) video.play().catch(() => {});
    else video.pause();
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

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; setMuted(v === 0); }
  };

  const toggleMute = () => {
    if (videoRef.current) { const newMuted = !muted; videoRef.current.muted = newMuted; setMuted(newMuted); }
  };

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

  // No URL state
  if (!url) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/20">
            <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">No Channel Selected</h2>
          <p className="text-sm text-[var(--text-muted)]">Choose a channel from the homepage to start watching.</p>
          <Link to="/" className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95 transition-transform">
            Browse Channels
          </Link>
        </div>
      </div>
    );
  }

  if (isToffee) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/20">
            <span className="text-2xl">📺</span>
          </div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Toffee Unavailable</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Toffee live streams have been removed. Watch FIFA World Cup matches on the World Cup tab instead.
          </p>
          <Link to="/?tab=worldcup" className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black active:scale-95 transition-transform">
            Watch FIFA Live
          </Link>
          <Link to="/" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const currentQualityLabel = currentLevel === -1 ? 'Auto' : availableLevels[currentLevel]?.label || 'Auto';

  return (
    <div className="page-container max-w-[1600px] py-3 md:py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">

        {/* ── Left Column: Video + Info + Watch Party + Related ── */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Video Player Container */}
          <div
            ref={containerRef}
            data-player-container
            className={`player-container relative w-full overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-[var(--border-primary)] ${isFullscreen ? 'is-fullscreen' : ''}`}
            onMouseMove={resetHideTimer}
            onTouchStart={resetHideTimer}
          >
            <video
              ref={videoRef}
              className={`player-video h-full w-full ${fitToScreen ? 'object-cover' : 'object-contain'}`}
              playsInline
              autoPlay
              muted
              onClick={togglePlay}
            />

            {/* Loading overlay */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/80 z-20"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin" />
                    <span className="text-xs text-slate-400">Loading stream...</span>
                  </div>
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
              {showControls && !loading && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-0 left-0 right-0 z-10"
                  onClick={(e) => e.stopPropagation()}
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
                      title={fitToScreen ? 'Fit to screen' : 'Fill screen'}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </button>

                    {/* PiP */}
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

          {/* Channel Info Bar — Fixed positioning, no text overlap */}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              {logo && logo.startsWith('http') && (
                <img src={logo} alt={name} className="h-9 w-9 shrink-0 rounded-lg object-contain bg-[var(--bg-tertiary)] p-1 sm:h-10 sm:w-10" />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-sm font-bold text-[var(--text-primary)] sm:text-base">{name}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="shrink-0 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                    Sports
                  </span>
                  <LiveBadge />
                  {availableLevels.length > 0 && (
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{currentQualityLabel}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                }}
                className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border-primary)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors active:scale-95 sm:px-3 sm:gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden sm:inline">Share</span>
              </button>
              <button
                onClick={() => setShowChat(!showChat)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border-primary)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors active:scale-95 lg:hidden sm:px-3 sm:gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden sm:inline">{showChat ? 'Hide' : 'Chat'}</span>
              </button>
            </div>
          </div>

          {/* ── Watch Party Room (10-user grid BELOW the stream) ── */}
          <Suspense fallback={<PanelLoader />}>
            <WatchPartyRoom partyCode={searchParams.get('party') || searchParams.get('room') || ''} />
          </Suspense>

          {/* Chat section (mobile only) */}
          {!isDesktop && showChat && (
            <div className="lg:hidden">
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden h-[50vh]">
                <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-2.5 bg-[var(--bg-tertiary)]/50">
                  <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-xs font-bold text-[var(--text-primary)]">Live Chat</span>
                </div>
                <div className="h-[calc(100%-40px)]">
                  <Suspense fallback={<PanelLoader />}>
                    <Chat />
                  </Suspense>
                </div>
              </div>
            </div>
          )}

          {/* Related Channels */}
          {relatedChannels.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">More Sports Channels</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {relatedChannels.map((ch) => (
                  <Link
                    key={ch.url || ch.name}
                    to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}&source=${encodeURIComponent(source || '')}`}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2 transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--bg-tertiary)] active:scale-[0.98]"
                  >
                    <div className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--bg-tertiary)]">
                      {ch.logo && ch.logo.startsWith('http') ? (
                        <img src={ch.logo} alt={ch.name} className="h-full w-full object-contain p-0.5" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <svg className="h-3 w-3 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[10px] font-bold text-[var(--text-primary)]">{ch.name}</p>
                      <LiveBadge className="scale-90 origin-left" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right Column: Chat Panel (Desktop only) ── */}
        {isDesktop && (
          <aside className="hidden lg:block w-[360px] shrink-0">
            <div className="sticky top-[100px]">
              <div className="flex flex-col rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden h-[calc(100vh-120px)]">
                <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-2.5 bg-[var(--bg-tertiary)]/50">
                  <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-xs font-bold text-[var(--text-primary)]">Live Chat</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={<PanelLoader />}>
                    <Chat />
                  </Suspense>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0" />
    </div>
  );
}
