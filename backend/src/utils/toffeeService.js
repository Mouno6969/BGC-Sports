import https from 'https';

// Toffee channel bypass data source (public, regularly updated)
const TOFFEE_DATA_URL = 'https://raw.githubusercontent.com/Gtajisan/Toffee-channel-bypass/main/toffee_channel_data.json';

// In-memory cache
let cache = {
  data: null,
  lastFetched: 0,
  ttl: 5 * 60 * 1000, // 5 minutes
};

/**
 * Fetch Toffee channel data with caching and error handling.
 * Safe, non-breaking implementation.
 */
export async function fetchToffeeChannels() {
  const now = Date.now();

  // Return cached data if still fresh
  if (cache.data && (now - cache.lastFetched) < cache.ttl) {
    return cache.data;
  }

  try {
    const response = await new Promise((resolve, reject) => {
      https.get(TOFFEE_DATA_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`Failed to fetch Toffee data: ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });

    const rawChannels = JSON.parse(response);

    // Normalize + add metadata
    const channels = rawChannels.map((ch, index) => ({
      id: `toffee-${index}`,
      name: ch.name || 'Unknown Channel',
      url: ch.link,
      type: 'hls',
      logo: ch.logo || null,
      headers: ch.headers || {},
      source: 'toffee',
      updatedAt: now,
    }));

    // Update cache
    cache.data = channels;
    cache.lastFetched = now;

    console.log(`[toffee] Fetched and cached ${channels.length} channels`);
    return channels;

  } catch (error) {
    console.error('[toffee] Fetch error:', error.message);

    // Return stale cache if available, otherwise empty array
    if (cache.data) {
      console.warn('[toffee] Returning stale cached data due to fetch error');
      return cache.data;
    }
    return [];
  }
}

/**
 * Get cached Toffee channels (fast, non-blocking)
 */
export function getToffeeChannels() {
  return cache.data || [];
}

/**
 * Force refresh (useful for admin or testing)
 */
export async function refreshToffeeChannels() {
  cache.lastFetched = 0;
  return fetchToffeeChannels();
}
