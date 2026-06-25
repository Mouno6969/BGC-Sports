// ---------------------------------------------------------------------------
// App — main application layout with improved design, animations,
// mobile responsiveness, and toast notifications.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from './components/Header.jsx';
import Player from './components/Player.jsx';
import Room from './components/Room.jsx';
import VideoCall from './components/VideoCall.jsx';
import Chat from './components/Chat.jsx';
import ToastContainer from './components/Toast.jsx';
import { useSocket } from './hooks/useSocket.js';
import { useRoom } from './hooks/useRoom.js';
import { apiGet } from './lib/config.js';
import { socket } from './lib/socket.js';
import { getStoredUsername } from './lib/utils.js';

export default function App() {
  const { connected } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stream, setStream] = useState(null);
  const [livekitEnabled, setLivekitEnabled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const {
    room,
    participants,
    error,
    kicked,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcastPlayback,
    requestSync,
    lockRoom,
    kickParticipant,
    setRemotePlaybackHandler,
  } = useRoom();

  // ----- Initial load: stream config + feature flags ------------------------
  useEffect(() => {
    apiGet('/api/stream')
      .then((d) => setStream(d.stream))
      .catch(() => setStream(null));
    apiGet('/api/health')
      .then((d) => setLivekitEnabled(Boolean(d.livekitEnabled)))
      .catch(() => setLivekitEnabled(false));
  }, []);

  // ----- Live stream updates pushed by admin --------------------------------
  useEffect(() => {
    function onStreamUpdate(s) {
      setStream(s);
    }
    socket.on('stream:update', onStreamUpdate);
    return () => socket.off('stream:update', onStreamUpdate);
  }, []);

  // ----- Deep-link: ?room=CODE auto-joins after connecting ------------------
  useEffect(() => {
    const code = searchParams.get('room');
    if (code && connected && !room) {
      joinRoom(code.toUpperCase(), getStoredUsername());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Keep the URL in sync with the active room (shareable link).
  useEffect(() => {
    if (room?.code) {
      setSearchParams({ room: room.code }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  const inRoom = Boolean(room);

  return (
    <div className="flex h-screen flex-col bg-ink-900 transition-colors duration-300">
      {/* Toast notifications */}
      <ToastContainer />

      {/* Header */}
      <Header connected={connected} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main column */}
        <main className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-5xl space-y-5">
            {/* Player */}
            <Player
              stream={stream}
              isHost={isHost}
              inRoom={inRoom}
              onLocalPlayback={broadcastPlayback}
              registerRemote={setRemotePlaybackHandler}
            />

            {/* Room + Call row */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Room
                room={room}
                participants={participants}
                error={error}
                kicked={kicked}
                isHost={isHost}
                onCreate={createRoom}
                onJoin={joinRoom}
                onLeave={leaveRoom}
                onRequestSync={requestSync}
                onLock={lockRoom}
                onKick={kickParticipant}
              />
              {inRoom && (
                <VideoCall
                  roomCode={room.code}
                  username={getStoredUsername() || 'Guest'}
                  livekitEnabled={livekitEnabled}
                />
              )}
            </div>
          </div>
        </main>

        {/* Chat panel — desktop sidebar */}
        <aside className="hidden w-80 shrink-0 border-l border-ink-700/50 bg-ink-800/50 backdrop-blur-sm lg:block">
          <Chat />
        </aside>
      </div>

      {/* Mobile chat toggle button */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-5 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black shadow-lg shadow-accent/20 transition-all duration-200 hover:scale-105 hover:shadow-glow-green active:scale-95 lg:hidden"
        title="Open chat"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* Mobile chat drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setChatOpen(false)}
          />
          {/* Drawer */}
          <div className="animate-slideInRight w-80 max-w-[85vw] border-l border-ink-700/50 bg-ink-800">
            <div className="flex items-center justify-between border-b border-ink-700/50 px-4 py-3">
              <span className="text-sm font-bold text-white">Chat</span>
              <button
                onClick={() => setChatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-ink-700 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)]">
              <Chat />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
