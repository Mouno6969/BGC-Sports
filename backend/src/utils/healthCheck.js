// ---------------------------------------------------------------------------
// Channel Health-Check Service
// Periodically tests channel stream URLs and maintains a "dead set" in memory.
// Dead channels are automatically filtered from all channel API responses.
// ---------------------------------------------------------------------------

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // Re-check every 5 minutes
const STREAM_TIMEOUT = 8000; // 8 seconds to respond

// In-memory set of dead channel URLs
const deadChannels = new Set();

// Track last check time per URL to avoid hammering
const lastChecked = new Map();

/**
 * Test if a stream URL is alive by attempting a HEAD/GET request.
 * For HLS streams (.m3u8), we check if the manifest is reachable.
 */
async function testStream(url) {
  if (!url || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    // Accept 200-399 as alive (some streams redirect)
    return res.status < 400;
  } catch {
    // Try GET as fallback (some servers don't support HEAD)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { Range: 'bytes=0-1024' },
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
 * Updates the deadChannels set accordingly.
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

  // Check in batches of 10 to avoid overwhelming network
  const BATCH_SIZE = 10;
  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (ch) => {
        const alive = await testStream(ch.url);
        lastChecked.set(ch.url, Date.now());
        return { url: ch.url, name: ch.name, alive };
      })
    );

    for (const { url, name, alive } of results) {
      if (!alive) {
        if (!deadChannels.has(url)) {
          console.log(`[health-check] DEAD: ${name} (${url.substring(0, 60)}...)`);
        }
        deadChannels.add(url);
      } else {
        if (deadChannels.has(url)) {
          console.log(`[health-check] RECOVERED: ${name}`);
        }
        deadChannels.delete(url);
      }
    }

    // Small delay between batches
    if (i + BATCH_SIZE < toCheck.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`[health-check] Done. Dead channels: ${deadChannels.size}`);
}

/**
 * Report a channel as dead (called from the player when stream fails in browser).
 * Immediately adds to dead set without waiting for next health check cycle.
 */
export function reportDead(url) {
  if (url && url.startsWith('http')) {
    deadChannels.add(url);
    lastChecked.set(url, Date.now());
    console.log(`[health-check] Reported dead by user: ${url.substring(0, 60)}...`);
  }
}

/**
 * Check if a channel URL is in the dead set.
 */
export function isDead(url) {
  return deadChannels.has(url);
}

/**
 * Filter an array of channels, removing dead ones.
 */
export function filterDead(channels) {
  return channels.filter((ch) => !deadChannels.has(ch.url));
}

/**
 * Get current dead channel count (for admin/debug).
 */
export function getDeadCount() {
  return deadChannels.size;
}

/**
 * Get all dead URLs (for admin/debug).
 */
export function getDeadUrls() {
  return [...deadChannels];
}

/**
 * Start the periodic health-check loop.
 * Pass a function that returns the current channels array.
 */
export function startHealthCheckLoop(getChannels) {
  // Initial check after 30 seconds (let server warm up)
  setTimeout(() => {
    checkChannels(getChannels());
  }, 30 * 1000);

  // Then repeat every HEALTH_CHECK_INTERVAL
  setInterval(() => {
    checkChannels(getChannels());
  }, HEALTH_CHECK_INTERVAL);

  console.log(`[health-check] Service started. Interval: ${HEALTH_CHECK_INTERVAL / 1000}s`);
}
