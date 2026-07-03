// ---------------------------------------------------------------------------
// Channel Health-Check Service
// Periodically tests channel stream URLs and maintains a "dead set" in memory.
// Dead channels are automatically filtered from all channel API responses.
//
// B1/B2 Hardening:
// - Strike-based dead marking (requires 3 consecutive failures).
// - Automatic recovery (removes from dead set on a single success).
// - Report validation (only marks dead if URL exists in the database).
// - Rate limiting for user reports (prevents spamming).
// ---------------------------------------------------------------------------

import fetch from 'node-fetch';

const HEALTH_CHECK_INTERVAL = 15 * 60 * 1000; // Re-check every 15 minutes
const STREAM_TIMEOUT = 8000; // 8 seconds to respond

// In-memory state
const deadChannels = new Set();
const strikeCounts = new Map(); // url -> consecutive failure count
const lastChecked = new Map();
const lastReportTimes = new Map(); // ip -> last report timestamp

/**
 * Test if a stream URL is alive by attempting a HEAD/GET request.
 */
async function testStream(url, headers = {}) {
  if (!url || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: headers
    });
    clearTimeout(timeout);
    return res.status < 400;
  } catch {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { Range: 'bytes=0-1024', ...headers },
      });
      clearTimeout(timeout);
      return res.status < 400;
    } catch {
      return false;
    }
  }
}

/**
 * Run health checks on a batch of channels.
 */
async function checkChannels(channels) {
  const now = Date.now();
  const toCheck = channels.filter((ch) => {
    if (!ch.url) return false;
    const last = lastChecked.get(ch.url) || 0;
    return now - last > HEALTH_CHECK_INTERVAL;
  });

  if (toCheck.length === 0) return;

  console.log(`[health-check] Testing ${toCheck.length} channels...`);

  const BATCH_SIZE = 10;
  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (ch) => {
        const alive = await testStream(ch.url, ch.headers || {});
        lastChecked.set(ch.url, Date.now());
        
        if (alive) {
          if (deadChannels.has(ch.url)) {
            console.log(`[health-check] RECOVERED: ${ch.name}`);
            deadChannels.delete(ch.url);
          }
          strikeCounts.delete(ch.url);
        } else {
          const strikes = (strikeCounts.get(ch.url) || 0) + 1;
          strikeCounts.set(ch.url, strikes);
          if (strikes >= 3 && !deadChannels.has(ch.url)) {
            console.log(`[health-check] DEAD (3 strikes): ${ch.name} (${ch.url})`);
            deadChannels.add(ch.url);
          }
        }
      })
    );
    if (i + BATCH_SIZE < toCheck.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(`[health-check] Done. Dead channels: ${deadChannels.size}`);
}

/**
 * Report a channel as dead.
 */
export function reportDead(url, getChannels, ip = 'unknown') {
  const now = Date.now();
  const lastReport = lastReportTimes.get(ip) || 0;
  if (now - lastReport < 10000) return;
  lastReportTimes.set(ip, now);

  const channels = getChannels();
  const exists = channels.some(ch => ch.url === url);
  if (!exists) return;

  const strikes = (strikeCounts.get(url) || 0) + 2;
  strikeCounts.set(url, strikes);
  if (strikes >= 3 && !deadChannels.has(url)) {
    console.log(`[health-check] DEAD (reported): ${url}`);
    deadChannels.add(url);
  }
}

export function isDead(url) {
  return deadChannels.has(url);
}

export function filterDead(channels) {
  return channels.filter((ch) => !deadChannels.has(ch.url));
}

export function getDeadCount() {
  return deadChannels.size;
}

export function getDeadUrls() {
  return [...deadChannels];
}

export function startHealthCheckLoop(getChannels) {
  setTimeout(() => checkChannels(getChannels()), 5 * 1000);
  setInterval(() => checkChannels(getChannels()), HEALTH_CHECK_INTERVAL);
  console.log(`[health-check] Service started. Interval: ${HEALTH_CHECK_INTERVAL / 1000}s`);
}
