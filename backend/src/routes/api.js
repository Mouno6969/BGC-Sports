// ---------------------------------------------------------------------------
// Public API routes:
//   GET  /api/health        -> service health + feature flags
//   GET  /api/stream        -> current global stream config (public)
//   GET  /api/toffee/channels -> Toffee live channels with required headers
//   POST /api/livekit/token -> mint a LiveKit access token for a room
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { config, isLiveKitConfigured } from '../config/index.js';
import { getStream } from '../utils/streamStore.js';
import { roomStore } from '../utils/roomStore.js';
import { sanitizeUsername } from '../utils/identity.js';
import { fetchToffeeChannels, getToffeeChannels } from '../utils/toffeeService.js';

const router = Router();

// Health check + feature flags so the frontend knows what's enabled.
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    livekitEnabled: isLiveKitConfigured(),
    livekitUrl: isLiveKitConfigured() ? config.livekit.url : null,
    maxParticipants: config.maxParticipantsPerRoom,
    toffeeEnabled: true,
  });
});

// Public read of the current stream config.
router.get('/stream', (req, res) => {
  res.json({ ok: true, stream: getStream() });
});

// Toffee channels - returns channels + the exact headers needed for playback
router.get('/toffee/channels', async (req, res) => {
  try {
    const channels = await fetchToffeeChannels();
    res.json({ 
      ok: true, 
      count: channels.length,
      channels,
      note: 'Pass the "headers" object to Hls.js via config.xhrSetup when playing these streams'
    });
  } catch (error) {
    console.error('[toffee] API error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load Toffee channels' });
  }
});

// Mint a LiveKit token for a participant joining a room's video call.
// Body: { roomCode, identity, name }
router.post('/livekit/token', async (req, res) => {
  if (!isLiveKitConfigured()) {
    return res
      .status(503)
      .json({ ok: false, error: 'LiveKit is not configured on the server' });
  }

  const { roomCode, identity, name } = req.body || {};
  if (!roomCode || !identity) {
    return res
      .status(400)
      .json({ ok: false, error: 'roomCode and identity are required' });
  }

  // The watch-party room must already exist (created via Socket.IO).
  const room = roomStore.getRoom(roomCode);
  if (!room) {
    return res.status(404).json({ ok: false, error: 'Room not found' });
  }

  try {
    // B3: Sanitize and cap identity/name to prevent oversized tokens or injection
    const safeIdentity = String(identity).replace(/[<>]/g, '').slice(0, 64);
    const safeName = (sanitizeUsername(name) || safeIdentity).slice(0, 64);

    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: safeIdentity,
      name: safeName,
      ttl: '2h',
    });
    // LiveKit room name = watch-party room code (uppercased).
    at.addGrant({
      room: room.code,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    res.json({ ok: true, token, url: config.livekit.url, room: room.code });
  } catch (err) {
    console.error('[livekit] token error:', err);
    res.status(500).json({ ok: false, error: 'Failed to create token' });
  }
});

export default router;
