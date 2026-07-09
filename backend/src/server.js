// ---------------------------------------------------------------------------
// BGC Sports — backend entrypoint.
// Express HTTP API + Socket.IO realtime (public chat + PRIVATE ROOMS with
// group chat, room-scoped video/audio calls, and full host controls +
// watch-party rooms + legacy WebRTC call signaling).
// ---------------------------------------------------------------------------

import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serveFrontend = process.env.SERVE_FRONTEND === '1';
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

import { config, isLiveKitConfigured } from './config/index.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import channelsRoutes from './routes/channels.js';
import logoProxyRoute from './routes/logoProxy.js';
import toffeeProxyRoute from './routes/toffeeProxy.js';
import toffeeCdnRoute from './routes/toffeeCdn.js';
import hlsProxyRoute from './routes/hlsProxy.js';
import scoresRoute from './routes/scores.js';
import aiRoute from './routes/ai.js';
import { registerChatHandlers } from './sockets/chat.js';
import { registerRoomHandlers } from './sockets/room.js';
import { registerCallHandlers } from './sockets/call.js';
import { registerPrivateRoomHandlers } from './sockets/privateRoom.js';

const app = express();
const server = http.createServer(app);

// ----------------------------- Middleware ----------------------------------
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());

// Tiny request logger (kept lightweight for the MVP).
app.use((req, _res, next) => {
  if (req.path !== '/api/health') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// ------------------------------- Routes ------------------------------------
if (!serveFrontend) {
  app.get('/', (_req, res) => {
    res.json({ name: 'BGC Sports API', status: 'ok' });
  });
}
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/logo-proxy', logoProxyRoute);
app.use('/api/toffee-proxy', toffeeProxyRoute);
app.use('/api/toffee-cdn', toffeeCdnRoute);
app.use('/api/hls-proxy', hlsProxyRoute);
app.use('/api/scores', scoresRoute);
app.use('/api/ai', aiRoute);

if (serveFrontend) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ------------------------------ Socket.IO ----------------------------------
const io = new SocketIOServer(server, {
  cors: {
    origin: config.clientOrigin,
    credentials: true,
  },
});

// Expose io to routes (admin uses it to broadcast stream updates).
app.set('io', io);

// B7: Global JSON error handler
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || 'Internal Server Error',
  });
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerChatHandlers(io, socket);
  registerRoomHandlers(io, socket);
  registerCallHandlers(io, socket);
  registerPrivateRoomHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

// ------------------------------- Startup -----------------------------------
server.listen(config.port, () => {
  console.log('-----------------------------------------------------------');
  console.log(` BGC Sports backend listening on port ${config.port}`);
  console.log(` CORS origin(s): ${JSON.stringify(config.clientOrigin)}`);
  console.log(
    ` LiveKit: ${isLiveKitConfigured() ? 'ENABLED' : 'DISABLED (set LIVEKIT_* env vars)'}`
  );
  console.log(' Private Rooms: ENABLED (group chat + video/audio call)');
  console.log(' Host Controls: kick, force-mute, lock, end-call, transfer-host');
  console.log(' BGC AI Agent: ENABLED (@bgc mention in any chat)');
  if (serveFrontend) {
    console.log(` Frontend: serving ${frontendDist}`);
  }
  console.log('-----------------------------------------------------------');
});
