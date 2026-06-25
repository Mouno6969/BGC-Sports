// ---------------------------------------------------------------------------
// Central configuration loader.
// Reads environment variables (loaded via dotenv in server.js) and exposes a
// single, validated config object used across the backend.
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated origins string into an array.
 * Supports "*" to allow all origins (development convenience only).
 */
function parseOrigins(raw) {
  if (!raw || raw.trim() === '*') return '*';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),

  // CORS origins for both Express and Socket.IO
  clientOrigin: parseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173'),

  // Admin panel password
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme-admin-password',

  // Default stream configuration (mutable at runtime via admin panel)
  defaultStream: {
    url:
      process.env.DEFAULT_STREAM_URL ||
      'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    type: process.env.DEFAULT_STREAM_TYPE || 'hls',
  },

  // LiveKit SFU credentials
  livekit: {
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    url: process.env.LIVEKIT_URL || '',
  },

  maxParticipantsPerRoom: parseInt(
    process.env.MAX_PARTICIPANTS_PER_ROOM || '8',
    10
  ),
};

/**
 * Returns true when LiveKit credentials are configured.
 * The app still runs without them, but group calls will be disabled.
 */
export function isLiveKitConfigured() {
  return Boolean(
    config.livekit.apiKey && config.livekit.apiSecret && config.livekit.url
  );
}
