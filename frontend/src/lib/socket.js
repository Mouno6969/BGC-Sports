// ---------------------------------------------------------------------------
// Single shared Socket.IO client instance used by chat + room features.
// ---------------------------------------------------------------------------

import { io } from 'socket.io-client';
import { BACKEND_URL } from './config.js';

const ROOM_CODE_LEN = 6;

function socketTarget() {
  if (typeof window === 'undefined') return BACKEND_URL || undefined;
  const origin = window.location.origin;
  if (origin.includes('5173') || origin.includes('5174')) {
    return origin.replace(/(5173|5174)/, '4000');
  }
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const url = new URL(origin);
    url.port = '4000';
    return url.origin;
  }
  // Same host as the page (tunnel/production). Polling first for tunnel reliability.
  return undefined;
}

export const socket = io(socketTarget(), {
  autoConnect: true,
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

/** Strip spaces/symbols from pasted codes (letter-spacing copy often adds spaces). */
export function sanitizeRoomCode(raw) {
  return String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, ROOM_CODE_LEN);
}

/** Wait until the shared socket is connected (with timeout). */
export function waitForSocketConnection(timeoutMs = 12000) {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Could not connect to the server. Check your connection and try again.'));
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(err?.message || 'Connection failed'));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
    if (!socket.active) socket.connect();
  });
}

// Helpful debug logging in development.
if (import.meta.env.DEV) {
  socket.on('connect', () => console.log('[socket] connected', socket.id));
  socket.on('disconnect', (r) => console.log('[socket] disconnected', r));
  socket.on('connect_error', (e) =>
    console.warn('[socket] connect_error', e.message)
  );
}
