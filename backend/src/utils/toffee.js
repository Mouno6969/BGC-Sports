// ---------------------------------------------------------------------------
// Toffee Stream Utility — Fetches and maps Toffee live streams.
// ---------------------------------------------------------------------------

import fetch from 'node-fetch';

const TOFFEE_DATA_URL = 'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/main/toffee_channel_data.json';

let cachedChannels = [];
let lastFetched = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches the latest Toffee channel data from the bypass repository.
 */
export async function fetchToffeeChannels() {
  const now = Date.now();
  if (cachedChannels.length > 0 && now - lastFetched < CACHE_TTL) {
    return cachedChannels;
  }

  try {
    console.log('[toffee] Fetching latest channel data...');
    const res = await fetch(TOFFEE_DATA_URL);
    if (!res.ok) throw new Error(`Failed to fetch Toffee data: ${res.status}`);
    
    const data = await res.json();
    if (!data.channels || !Array.isArray(data.channels)) {
      throw new Error('Invalid Toffee data format');
    }

    // Map Toffee channels to BGC-Sports format
    const mapped = data.channels.map(ch => ({
      name: `[Toffee] ${ch.name}`,
      logo: ch.logo,
      group: 'Toffee',
      url: ch.link,
      headers: ch.headers // Store headers for the player
    }));

    cachedChannels = mapped;
    lastFetched = now;
    console.log(`[toffee] Successfully fetched ${mapped.length} channels`);
    return mapped;
  } catch (err) {
    console.error('[toffee] Error fetching channels:', err.message);
    return cachedChannels; // Return stale cache on error
  }
}

/**
 * Returns a list of all channels including Toffee ones.
 */
export async function getAllChannels(baseChannels = []) {
  const toffee = await fetchToffeeChannels();
  return [...baseChannels, ...toffee];
}
