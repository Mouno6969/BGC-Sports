// ---------------------------------------------------------------------------
// Holds the current global live-stream configuration.
// Seeded from env defaults; updated at runtime by the admin panel.
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';

let currentStream = {
  url: config.defaultStream.url,
  type: config.defaultStream.type, // "hls" | "youtube" | "twitch"
  updatedAt: Date.now(),
};

export function getStream() {
  return currentStream;
}

export function setStream({ url, type }) {
  currentStream = {
    url: String(url || '').trim(),
    type: ['hls', 'youtube', 'twitch'].includes(type) ? type : 'hls',
    updatedAt: Date.now(),
  };
  return currentStream;
}
