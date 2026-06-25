// ---------------------------------------------------------------------------
// App — main watch-party experience.
//
// Layout (desktop):
//   ┌──────────────────────────────┬───────────────┐
//   │  Header (full width)                          │
//   ├──────────────────────────────┬───────────────┤
//   │  Player (video)              │  Chat panel    │
//   │  Room panel + Video call     │  (right side)  │
//   └──────────────────────────────┴───────────────┘
//
// On mobile the chat panel collapses into a toggleable drawer.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from './components/Header.jsx';
import Player from './components/Player.jsx';
import Chat from './components/Chat.jsx';
import Room from './components/Room.jsx';
import VideoCall from './components/VideoCall.jsx';
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
  const [chatOpen, setChatOpen] = useState(false); // mobile drawer

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
    <div className="flex h-screen flex-col bg-ink-900">
      <Header connected={connected} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main column */}
        <main className="scrollbar-thin flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-5xl space-y-4">
            <Player
              stream={stream}
              isHost={isHost}
              inRoom={inRoom}
              onLocalPlayback={broadcastPlayback}
              registerRemote={setRemotePlaybackHandler}
            />

            {/* Room + call row */}
            <div className="grid gap-4 md:grid-cols-2">
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
        <aside className="hidden w-80 shrink-0 border-l border-ink-700 bg-ink-800 lg:block">
          <Chat />
        </aside>
      </div>

      {/* Mobile chat toggle */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-4 right-4 z-20 rounded-full bg-accent px-4 py-3 text-sm font-bold text-black shadow-lg lg:hidden"
      >
        Chat
      </button>

      {/* Mobile chat drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          <div
            className="flex-1 bg-black/60"
            onClick={() => setChatOpen(false)}
          />
          <div className="w-80 max-w-[85%] border-l border-ink-700 bg-ink-800">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setChatOpen(false)}
                className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-ink-700"
              >
                ✕ Close
              </button>
            </div>
            <div className="h-[calc(100%-3rem)]">
              <Chat />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
