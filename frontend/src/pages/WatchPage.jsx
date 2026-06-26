// ---------------------------------------------------------------------------
// WatchPage — Enhanced with custom player controls, PiP, quality selector,
// smooth loading spinner, draggable call window, tab slide animations.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Hls from 'hls.js';
import { apiGet, apiPost } from '../lib/config.js';
import { getStoredUsername } from '../lib/utils.js';
import ChannelCard from '../components/ChannelCard.jsx';
import Chat from '../components/Chat.jsx';
import PrivateChat from '../components/PrivateChat.jsx';
import PeerCall from '../components/PeerCall.jsx';

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'dm', label: 'DM', icon: 'dm' },
  { id: 'call', label: 'Call', icon: 'call' },
];

const QUALITY_OPTIONS = ['Auto', '1080p', '720p', '480p', '360p'];

function TabIcon({ type, className }) {
  switch (type) {
    case 'chat':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'dm':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'call':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

// Custom Video Player Controls Overlay
function PlayerControls({ videoRef, isPlaying, loading, onTogglePlay, onToggleFullscreen, isFullscreen }) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [quality, setQuality] = useState('Auto');
  const [showQuality, setShowQuality] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const hideTimer = useRef(null);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [resetHideTimer]);

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
      setMuted(v === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !muted;
      videoRef.current.muted = newMuted;
      setMuted(newMuted);
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (e) {
      console.warn('PiP not supported:', e);
    }
  };

  return (
    <div
      className="absolute inset-0 z-10"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={onTogglePlay}
    >
      {/* Loading spinner */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-ink-900/80 z-20"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-t-accent/60 animate-spin" style={{ animationDuration: '0.8s', animationDirection: 'reverse' }} />
              </div>
              <span className="text-sm font-medium text-slate-300">Loading stream...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 z-10"
            onClick={e => e.stopPropagation()}
          >
            {/* Gradient fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

            {/* Controls bar */}
            <div className="relative flex items-center gap-3 px-4 py-3">
              {/* Play/Pause */}
              <button
                onClick={onTogglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-all active:scale-90"
              >
                {isPlaying ? (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="text-white/80 hover:text-white transition-colors"
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
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 accent-emerald-400 cursor-pointer"
                />
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Quality selector */}
              <div className="relative">
                <button
                  onClick={() => setShowQuality(v => !v)}
                  className="flex items-center gap-1 rounded-lg bg-white/10 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-white/20 transition-all active:scale-95"
                >
                  {quality}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <AnimatePresence>
                  {showQuality && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute bottom-full right-0 mb-1 rounded-xl border border-ink-500/50 bg-ink-800/95 backdrop-blur-sm shadow-xl overflow-hidden"
                    >
                      {QUALITY_OPTIONS.map(q => (
                        <button
                          key={q}
                          onClick={() => { setQuality(q); setShowQuality(false); }}
                          className={`flex w-full items-center justify-between gap-6 px-4 py-2 text-xs font-semibold transition-colors hover:bg-ink-700 ${quality === q ? 'text-accent' : 'text-white'}`}
                        >
                          {q}
                          {quality === q && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* PiP button */}
              {document.pictureInPictureEnabled && (
                <button
                  onClick={togglePiP}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg backdrop-blur-sm text-white transition-all active:scale-90 ${isPiP ? 'bg-accent/30 text-accent' : 'bg-white/10 hover:bg-white/20'}`}
                  title="Picture-in-Picture"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M13 17h8v-5h-8v5z" />
                  </svg>
                </button>
              )}

              {/* Fullscreen */}
              <button
                onClick={onToggleFullscreen}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-all active:scale-90"
                title="Fullscreen"
              >
                {isFullscreen ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WatchPage() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const name = searchParams.get('name') || 'Live Stream';
  const logo = searchParams.get('logo') || '';
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [relatedChannels, setRelatedChannels] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [prevTab, setPrevTab] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const username = getStoredUsername() || 'Guest';
  const channelId = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  // Load HLS stream
  useEffect(() => {
    if (!url) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLoading(true);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, enableWorker: true, maxBufferSize: 30 * 1024 * 1024, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError('Stream unavailable — the source may be offline or geo-restricted.');
          setLoading(false);
          // Report dead stream to backend so it's hidden for everyone
          apiPost('/api/channels/report-dead', { url }).catch(() => {});
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadeddata', () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    } else {
      setError('HLS playback is not supported in this browser.');
      setLoading(false);
    }
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [url]);

  // Load related channels
  useEffect(() => {
    apiGet('/api/channels/sports')
      .then((data) => {
        const related = (data.channels || []).filter((ch) => ch.url !== url).sort(() => Math.random() - 0.5).slice(0, 8);
        setRelatedChannels(related);
      })
      .catch(() => {});
  }, [url]);

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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('player-container');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleTabChange = (tabId) => {
    setPrevTab(activeTab);
    setActiveTab(tabId);
  };

  const tabDirection = TABS.findIndex(t => t.id === activeTab) > TABS.findIndex(t => t.id === prevTab) ? 1 : -1;

  if (!url) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">No Channel Selected</h2>
          <p className="text-sm text-[var(--text-muted)]">Choose a channel from the homepage to start watching.</p>
          <Link to="/" className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black active:scale-95 transition-transform">Browse Channels</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Main Player Column */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Player */}
          <div
            id="player-container"
            className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-[var(--border-primary)]"
          >
            <video
              ref={videoRef}
              className="h-full w-full"
              playsInline
              autoPlay
              muted
            />

            {/* Custom Controls Overlay */}
            <PlayerControls
              videoRef={videoRef}
              isPlaying={isPlaying}
              loading={loading}
              onTogglePlay={togglePlay}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
            />

            {/* Error overlay */}
            {error && !loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/90 p-4 text-center">
                <div className="flex flex-col items-center gap-3 max-w-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                    <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-red-300">{error}</p>
                  <Link to="/" className="mt-2 rounded-lg bg-ink-700 px-4 py-2 text-xs font-bold text-white hover:bg-ink-600">Try Another Channel</Link>
                </div>
              </div>
            )}
          </div>

          {/* Channel Info Bar */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
            <div className="flex items-center gap-3">
              {logo && logo.startsWith('http') && (
                <img src={logo} alt={name} className="h-10 w-10 rounded-lg object-contain bg-[var(--bg-tertiary)] p-1" />
              )}
              <div>
                <h1 className="font-display text-base font-bold text-[var(--text-primary)]">{name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase"
                    style={{ background: 'rgba(239,68,68,0.1)', boxShadow: '0 0 8px rgba(239,68,68,0.3)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
                    <span className="text-red-400">LIVE</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] lg:hidden active:scale-95"
                title="Toggle sidebar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95"
                title="Fullscreen"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              <Link
                to="/"
                className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                All Channels
              </Link>
            </div>
          </div>

          {/* Related Channels */}
          {relatedChannels.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">More Sports Channels</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {relatedChannels.map((ch, i) => (
                  <Link
                    key={i}
                    to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2.5 transition-all hover:border-accent/30 hover:bg-[var(--bg-tertiary)] hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                      {ch.logo && ch.logo.startsWith('http') ? (
                        <img src={ch.logo} alt={ch.name} className="h-full w-full object-contain p-1" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[11px] font-bold text-[var(--text-primary)]">{ch.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
                        <span className="text-[9px] font-bold text-red-400">LIVE</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — Chat / DM / Call */}
        <aside className={`w-full lg:w-[380px] shrink-0 ${sidebarOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="flex h-[calc(100vh-120px)] flex-col rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-card overflow-hidden sticky top-4">
            {/* Tab Bar */}
            <div className="relative flex border-b border-ink-600/50">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                    activeTab === tab.id
                      ? 'text-accent bg-accent/5'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-ink-700/30'
                  }`}
                >
                  <TabIcon type={tab.icon} className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
              {/* Sliding tab indicator */}
              <motion.div
                className="absolute bottom-0 h-0.5 bg-accent rounded-full"
                style={{ width: `${100 / TABS.length}%` }}
                animate={{ left: `${(TABS.findIndex(t => t.id === activeTab) / TABS.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>

            {/* Tab Content with slide animation */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: tabDirection * 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: tabDirection * -30 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0"
                >
                  {activeTab === 'chat' && <Chat />}
                  {activeTab === 'dm' && <PrivateChat />}
                  {activeTab === 'call' && (
                    <div className="h-full overflow-y-auto p-4 scrollbar-thin">
                      <PeerCall channelId={channelId} username={username} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0" />
    </div>
  );
}
