// ---------------------------------------------------------------------------
// Single shared Socket.IO client instance used by chat + room features.
// ---------------------------------------------------------------------------

import { io } from 'socket.io-client';
import { BACKEND_URL } from './config.js';

// autoConnect: connect immediately on import.
// transports: prefer websocket but allow polling fallback.
export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

// Helpful debug logging in development.
if (import.meta.env.DEV) {
  socket.on('connect', () => console.log('[socket] connected', socket.id));
  socket.on('disconnect', (r) => console.log('[socket] disconnected', r));
  socket.on('connect_error', (e) =>
    console.warn('[socket] connect_error', e.message)
  );
}
