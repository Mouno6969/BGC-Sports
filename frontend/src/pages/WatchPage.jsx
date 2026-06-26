// ---------------------------------------------------------------------------
// WatchPage — Full player page with HLS stream, channel info, and a
// professional tabbed sidebar with Public Chat, Private Chat, Call, and Room.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Hls from 'hls.js';
import { apiGet } from '../lib/config.js';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const username = getStoredUsername() || 'Guest';
  // Use channel name as unique channel ID for calls
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
      const hls = new Hls({
        lowLatencyMode: true,
        enableWorker: true,
        maxBufferSize: 30 * 1024 * 1024,
        maxBufferLength: 30,
      });
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
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadeddata', () => {
        setLoading(false);
        video.play().catch(() => {});
      }, { once: true });
    } else {
      setError('HLS playback is not supported in this browser.');
      setLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url]);

  // Load related channels
  useEffect(() => {
    apiGet('/api/channels/sports')
      .then((data) => {
        const related = (data.channels || [])
          .filter((ch) => ch.url !== url)
          .sort(() => Math.random() - 0.5)
          .slice(0, 8);
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
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  const toggleFullscreen = () => {
    const container = document.getElementById('player-container');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

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
          <Link to="/" className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black">
            Browse Channels
          </Link>
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
            {/* Loading */}
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-900">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  <span className="text-sm text-slate-400">Loading stream...</span>
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              className="h-full w-full"
              controls
              playsInline
              autoPlay
              muted
            />

            {/* Error overlay */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 text-center">
                <div className="flex flex-col items-center gap-3 max-w-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                    <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-red-300">{error}</p>
                  <Link to="/" className="mt-2 rounded-lg bg-ink-700 px-4 py-2 text-xs font-bold text-white hover:bg-ink-600">
                    Try Another Channel
                  </Link>
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
                  <span className="h-2 w-2 animate-pulseLive rounded-full bg-red-500"></span>
                  <span className="text-xs text-red-400 font-bold">LIVE</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Toggle sidebar on mobile */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] lg:hidden"
                title="Toggle sidebar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                title="Fullscreen"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              <Link
                to="/"
                className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
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
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                More Sports Channels
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {relatedChannels.map((ch, i) => (
                  <Link
                    key={i}
                    to={`/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2.5 transition-all hover:border-accent/30 hover:bg-[var(--bg-tertiary)]"
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
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive"></span>
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
            <div className="flex border-b border-ink-600/50">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'border-b-2 border-accent text-accent bg-accent/5'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-ink-700/30'
                  }`}
                >
                  <TabIcon type={tab.icon} className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'chat' && <Chat />}
              {activeTab === 'dm' && <PrivateChat />}
              {activeTab === 'call' && (
                <div className="h-full overflow-y-auto p-4 scrollbar-thin">
                  <PeerCall channelId={channelId} username={username} />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
