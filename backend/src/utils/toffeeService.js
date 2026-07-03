import https from 'https';
import fetch from 'node-fetch';

// Primary and Fallback data sources
const SOURCES = [
  'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/dev/toffee_data.json',
  'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/main/toffee_channel_data.json',
  'https://raw.githubusercontent.com/abusaeeidx/Toffee-playlist/main/toffee_channel_data.json'
];

// In-memory cache
let cache = {
  data: null,
  lastFetched: 0,
  ttl: 2 * 60 * 1000, // 2 minutes for faster updates
};

/**
 * Fetch from a single source
 */
async function fetchFromSource(url) {
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.channels || !Array.isArray(data.channels)) return null;
    return data.channels;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch Toffee channel data with multi-source fallback
 */
export async function fetchToffeeChannels() {
  const now = Date.now();

  if (cache.data && (now - cache.lastFetched) < cache.ttl) {
    return cache.data;
  }

  console.log('[toffee] Refreshing channel data...');

  for (const source of SOURCES) {
    const rawChannels = await fetchFromSource(source);
    if (rawChannels && rawChannels.length > 0) {
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

      cache.data = channels;
      cache.lastFetched = now;
      console.log(`[toffee] Successfully fetched ${channels.length} channels from ${source}`);
      return channels;
    }
  }

  console.error('[toffee] All data sources failed!');
  return cache.data || [];
}

/**
 * Get cached Toffee channels
 */
export function getToffeeChannels() {
  return cache.data || [];
}

/**
 * Find a channel by its URL to retrieve its headers
 */
export async function getToffeeChannelByUrl(url) {
  const channels = await fetchToffeeChannels();
  if (!url) return null;
  
  const targetBase = url.split('?')[0].toLowerCase();
  
  // Try exact match first
  let found = channels.find(ch => ch.url && ch.url.split('?')[0].toLowerCase() === targetBase);
  
  // If not found, try partial match (some URLs might be slightly different)
  if (!found) {
    const channelName = url.split('/').pop()?.split('.')[0];
    if (channelName) {
      found = channels.find(ch => ch.url && ch.url.toLowerCase().includes(channelName.toLowerCase()));
    }
  }

  return found;
}

/**
 * Force refresh
 */
export async function refreshToffeeChannels() {
  cache.lastFetched = 0;
  return fetchToffeeChannels();
}
