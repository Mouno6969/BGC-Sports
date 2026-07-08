import { randomUUID } from 'crypto';
import { normalizeToffeeHeaders } from './headerNormalizer.js';

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [id, entry] of sessions.entries()) {
    if (entry.expiresAt <= now) sessions.delete(id);
  }
}

export function createToffeeSession(headers = {}) {
  purgeExpired();
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const normalized = normalizeToffeeHeaders(headers);
  sessions.set(id, {
    headers: normalized,
    expiresAt: Date.now() + TTL_MS,
  });
  return { sessionId: id, expiresAt: Date.now() + TTL_MS };
}

export function getToffeeSession(sessionId) {
  if (!sessionId) return null;
  purgeExpired();
  const entry = sessions.get(String(sessionId));
  if (!entry) return null;
  entry.expiresAt = Date.now() + TTL_MS;
  return entry.headers;
}