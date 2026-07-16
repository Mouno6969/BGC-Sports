// ---------------------------------------------------------------------------
// Toffee egress proxy pool.
//
// Toffee CDN hostnames (bldcmprod-cdn.toffeelive.com, prod-cdn01-live.*) often
// have NO public A-records outside Bangladesh. This pool:
//   1) Uses TOFFEE_PROXY_URLS when set
//   2) Auto-discovers free BD/IN HTTP/SOCKS proxies
//   3) Proves each proxy can fetch a real Toffee m3u8
//   4) Rotates healthy proxies for all CDN requests
// ---------------------------------------------------------------------------
import fetch from 'node-fetch';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toffeeConfig } from './config.js';

const PROBE_TTL_MS = 12 * 60 * 1000;
const DISCOVER_TTL_MS = 20 * 60 * 1000;
const DEAD_COOLDOWN_MS = 45_000;
const MAX_WORKING = 8;
const PERSIST_PATH = new URL('../../data/toffee-proxies.json', import.meta.url);

const PROXY_LIST_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=8000&country=BD',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=8000&country=BD',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=6000&country=IN',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
];

let working = []; // { url, agent, id, lastOk }
let deadUntil = new Map();
let rotateIdx = 0;
let discoverInFlight = null;
let lastDiscoverAt = 0;
let lastForceAt = 0;
let lastProbeCookie = '';
let defaultTestUrl =
  'https://bldcmprod-cdn.toffeelive.com/cdn/live/euro_sports_hd/playlist.m3u8';
const FORCE_COOLDOWN_MS = 75_000;

function buildAgent(proxyUrl) {
  if (/^socks/i.test(proxyUrl)) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

function normalizeProxyUrl(raw = '') {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t) || /^socks/i.test(t)) return t;
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(t)) return `http://${t}`;
  return t;
}

function loadPersisted() {
  try {
    const p = fileURLToPath(PERSIST_PATH);
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    if (Array.isArray(raw?.proxies)) {
      working = raw.proxies
        .map((url, i) => ({
          url: normalizeProxyUrl(url),
          id: `persisted-${i}`,
          agent: buildAgent(normalizeProxyUrl(url)),
          lastOk: Date.now() - 60_000,
        }))
        .filter((w) => w.url);
      lastDiscoverAt = raw.at || 0;
      if (working.length) {
        console.log(`[toffee-proxy-pool] restored ${working.length} proxy(ies) from disk`);
      }
    }
  } catch {
    /* no cache yet */
  }
}

function persistWorking() {
  try {
    const p = fileURLToPath(PERSIST_PATH);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(
      p,
      JSON.stringify(
        { at: Date.now(), proxies: working.map((w) => w.url) },
        null,
        2
      )
    );
  } catch (err) {
    console.warn('[toffee-proxy-pool] persist failed:', err.message);
  }
}

// Restore on module load
loadPersisted();

function isBdish(ipPort = '') {
  return /^(103|182|114|123|27|59|118|119|202|203)\./.test(ipPort);
}

async function fetchText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BGC-Sports-Toffee-ProxyPool/1.0' },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function collectCandidates() {
  const set = new Set();

  // Env / config first
  for (const p of toffeeConfig.proxyUrls || []) {
    const n = normalizeProxyUrl(p);
    if (n) set.add(n);
  }
  if (process.env.TOFFEE_PROXY_URL) {
    const n = normalizeProxyUrl(process.env.TOFFEE_PROXY_URL);
    if (n) set.add(n);
  }

  // Public lists
  for (const src of PROXY_LIST_SOURCES) {
    const text = await fetchText(src, 12000);
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+\.\d+\.\d+\.\d+:\d+)/);
      if (!m) continue;
      // Prefer HTTP for free lists; SOCKS only if source says socks
      if (/socks5/i.test(src)) set.add(`socks5://${m[1]}`);
      else set.add(`http://${m[1]}`);
    }
  }

  const all = Array.from(set);
  const prefer = all.filter((u) => isBdish(u.replace(/^.*\/\//, '')));
  const rest = all.filter((u) => !prefer.includes(u));
  return [...prefer, ...rest].slice(0, 80);
}

/**
 * Prove a proxy can reach Toffee CDN and return a playlist.
 */
export async function proveProxy(proxyUrl, { testUrl, headers = {} } = {}) {
  if (!testUrl) return false;
  const dead = deadUntil.get(proxyUrl) || 0;
  if (Date.now() < dead) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const agent = buildAgent(proxyUrl);
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': headers['User-Agent'] || headers['user-agent'] || 'okhttp/5.1.0',
        Cookie: headers.Cookie || headers.cookie || '',
        'client-api-header': headers['client-api-header'] || '',
        Referer: headers.Referer || 'https://www.toffee.live/',
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      },
      agent,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      deadUntil.set(proxyUrl, Date.now() + DEAD_COOLDOWN_MS);
      return false;
    }
    const text = await res.text();
    if (!text.includes('#EXTM3U')) {
      deadUntil.set(proxyUrl, Date.now() + DEAD_COOLDOWN_MS);
      return false;
    }
    return true;
  } catch {
    deadUntil.set(proxyUrl, Date.now() + DEAD_COOLDOWN_MS);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refresh working proxy list. Call with a real Toffee URL + auth headers.
 */
export async function ensureToffeeProxies({ testUrl, headers = {}, force = false } = {}) {
  const now = Date.now();
  const probeUrl = testUrl || defaultTestUrl;

  // Rate-limit forced rediscovery — free proxies thrash otherwise
  let doForce = force;
  if (doForce && now - lastForceAt < FORCE_COOLDOWN_MS && working.length > 0) {
    doForce = false;
  }
  if (doForce) lastForceAt = now;

  const stillFresh =
    !doForce
    && working.length > 0
    && now - lastDiscoverAt < PROBE_TTL_MS
    && working.some((w) => now - w.lastOk < PROBE_TTL_MS);

  if (stillFresh) return working;

  if (discoverInFlight) return discoverInFlight;

  discoverInFlight = (async () => {
    try {
      // Keep previously working ones if still good (parallel re-prove)
      const kept = [];
      if (working.length) {
        const recheck = await Promise.all(
          working.map(async (w) => {
            const ok = await proveProxy(w.url, { testUrl: probeUrl, headers });
            return ok ? { ...w, agent: buildAgent(w.url), lastOk: Date.now() } : null;
          })
        );
        for (const w of recheck) if (w) kept.push(w);
      }

      if (kept.length >= 1 && now - lastDiscoverAt < DISCOVER_TTL_MS && !doForce) {
        working = kept;
        lastDiscoverAt = now;
        persistWorking();
        return working;
      }

      console.log('[toffee-proxy-pool] discovering egress proxies…');
      const candidates = await collectCandidates();
      const found = [...kept];
      const seen = new Set(found.map((f) => f.url));
      const started = Date.now();
      // Fast path for playback: return as soon as we have a few working proxies
      const targetCount = doForce ? 2 : MAX_WORKING;
      const BUDGET_MS = doForce ? 22_000 : 45_000;

      // Parallel batches — stop once we have enough or budget expires
      const batchSize = 16;
      for (let i = 0; i < candidates.length && found.length < targetCount; i += batchSize) {
        if (Date.now() - started > BUDGET_MS) break;
        const batch = candidates.slice(i, i + batchSize).filter((u) => !seen.has(u));
        const results = await Promise.all(
          batch.map(async (url) => {
            const ok = await proveProxy(url, { testUrl: probeUrl, headers });
            return ok ? url : null;
          })
        );
        for (const url of results) {
          if (!url || seen.has(url)) continue;
          seen.add(url);
          found.push({
            url,
            id: `auto-${found.length}`,
            agent: buildAgent(url),
            lastOk: Date.now(),
          });
          console.log(`[toffee-proxy-pool] working: ${url}`);
          if (found.length >= targetCount) break;
        }
        // Early exit: one proven proxy is enough to start streaming
        if (found.length >= 1 && doForce && Date.now() - started > 8_000) break;
      }

      working = found;
      lastDiscoverAt = Date.now();
      lastProbeCookie = headers.Cookie || headers.cookie || '';
      persistWorking();
      console.log(`[toffee-proxy-pool] ready: ${working.length} proxy(ies)`);
      return working;
    } finally {
      discoverInFlight = null;
    }
  })();

  return discoverInFlight;
}

export function hasWorkingProxy() {
  return working.length > 0 || (toffeeConfig.proxyUrls || []).length > 0;
}

export function nextWorkingProxy() {
  // Prefer proven working pool
  const now = Date.now();
  const alive = working.filter((w) => now - w.lastOk < PROBE_TTL_MS * 2);
  if (alive.length) {
    const pick = alive[rotateIdx % alive.length];
    rotateIdx += 1;
    return { id: pick.id, url: pick.url, agent: pick.agent || buildAgent(pick.url) };
  }

  // Fall back to env proxies
  const env = (toffeeConfig.proxyUrls || []).map(normalizeProxyUrl).filter(Boolean);
  if (!env.length) return null;
  const url = env[rotateIdx % env.length];
  rotateIdx += 1;
  return { id: 'env', url, agent: buildAgent(url) };
}

export function markProxyFailed(proxyUrl) {
  if (!proxyUrl) return;
  deadUntil.set(proxyUrl, Date.now() + DEAD_COOLDOWN_MS);
  working = working.filter((w) => w.url !== proxyUrl);
}

export function markProxyOk(proxyUrl) {
  const w = working.find((x) => x.url === proxyUrl);
  if (w) w.lastOk = Date.now();
}

export function getProxyPoolStatus() {
  return {
    working: working.map((w) => ({ url: w.url, id: w.id, ageMs: Date.now() - w.lastOk })),
    envCount: (toffeeConfig.proxyUrls || []).length,
    lastDiscoverAt,
  };
}
