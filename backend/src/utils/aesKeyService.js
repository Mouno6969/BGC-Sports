// ---------------------------------------------------------------------------
// AES-128 HLS key service for bozztv/rongo (and similar) streams.
//
// gia.tv blocks most datacenter IPs (Cloudflare 403). We try:
//   1) Env HLS_AES_KEY_HEX / BTV_AES_KEY_HEX (static override)
//   2) Disk cache
//   3) Direct + curl-impersonate fetch
//   4) Free HTTP/SOCKS proxies (best-effort)
//
// When a key is obtained it is cached and used to decrypt segments server-side
// so the browser receives clear MPEG-TS (no client key fetch).
// ---------------------------------------------------------------------------
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

const CACHE_PATH = fileURLToPath(new URL('../../data/aes-keys.json', import.meta.url));
const KEY_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_KEY_URL = 'https://gia.tv/aes/rongotv/userkey.php?';

/** @type {Map<string, { key: Buffer, at: number }>} */
const memory = new Map();
let huntInFlight = null;
let lastHuntAt = 0;

function loadDisk() {
  try {
    if (!existsSync(CACHE_PATH)) return;
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    for (const [url, entry] of Object.entries(raw.keys || {})) {
      if (!entry?.hex || !entry?.at) continue;
      if (Date.now() - entry.at > KEY_TTL_MS) continue;
      memory.set(url, { key: Buffer.from(entry.hex, 'hex'), at: entry.at });
    }
  } catch {
    /* ignore */
  }
}

function persistDisk() {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    const keys = {};
    for (const [url, entry] of memory.entries()) {
      keys[url] = { hex: entry.key.toString('hex'), at: entry.at };
    }
    writeFileSync(CACHE_PATH, JSON.stringify({ at: Date.now(), keys }, null, 2));
  } catch (err) {
    console.warn('[aes-key] persist failed:', err.message);
  }
}

loadDisk();

function envKeyFor(url = '') {
  const hex = (
    process.env.HLS_AES_KEY_HEX
    || process.env.BTV_AES_KEY_HEX
    || process.env.RONGO_AES_KEY_HEX
    || ''
  ).trim().replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  // Optional map: HLS_AES_KEYS=urlhex=...,url2=...
  const map = process.env.HLS_AES_KEYS || '';
  if (map && url) {
    for (const part of map.split(',')) {
      const [u, h] = part.split('=').map((s) => s?.trim());
      if (u && h && url.includes(u) && /^[0-9a-fA-F]{32}$/.test(h.replace(/^0x/i, ''))) {
        return Buffer.from(h.replace(/^0x/i, ''), 'hex');
      }
    }
  }
  return null;
}

export function getCachedAesKey(keyUrl = DEFAULT_KEY_URL) {
  const env = envKeyFor(keyUrl);
  if (env) return env;
  const hit = memory.get(keyUrl) || memory.get(DEFAULT_KEY_URL);
  if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
  return null;
}

export function setCachedAesKey(keyUrl, keyBuf) {
  if (!keyBuf || keyBuf.length < 16) return;
  const key = keyBuf.length === 16 ? keyBuf : keyBuf.subarray(0, 16);
  memory.set(keyUrl || DEFAULT_KEY_URL, { key, at: Date.now() });
  persistDisk();
  console.log(`[aes-key] cached ${key.length}-byte key for ${keyUrl || DEFAULT_KEY_URL}`);
}

function looksLikeKey(buf) {
  if (!buf || buf.length < 16 || buf.length > 64) return false;
  if (buf[0] === 0x3c) return false; // HTML
  // Prefer exact AES-128 length
  return buf.length === 16 || buf.length === 32;
}

async function fetchKeyDirect(keyUrl) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Referer: 'https://bozztv.com/',
    Origin: 'https://bozztv.com',
    Accept: '*/*',
  };

  // Prefer curl-impersonate chrome binaries if present
  const impersonateBins = [
    '/tmp/curl_chrome116',
    '/tmp/curl_chrome110',
    '/tmp/curl_chrome104',
    'curl',
  ];
  for (const bin of impersonateBins) {
    try {
      const args =
        bin === 'curl'
          ? [
              '-sL',
              '--http1.1',
              '--max-time',
              '12',
              '-A',
              headers['User-Agent'],
              '-H',
              `Referer: ${headers.Referer}`,
              '-H',
              `Origin: ${headers.Origin}`,
              '-H',
              'Accept: */*',
              keyUrl,
            ]
          : [
              '-sL',
              '--max-time',
              '12',
              '-H',
              `Referer: ${headers.Referer}`,
              '-H',
              `Origin: ${headers.Origin}`,
              '-H',
              'Accept: */*',
              keyUrl,
            ];
      const { stdout } = await execFileAsync(bin, args, {
        encoding: 'buffer',
        maxBuffer: 64 * 1024,
      });
      if (looksLikeKey(stdout)) return stdout.subarray(0, 16);
    } catch {
      /* try next */
    }
  }

  try {
    const res = await fetch(keyUrl, { headers, timeout: 12_000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (looksLikeKey(buf)) return buf.subarray(0, 16);
  } catch {
    /* ignore */
  }
  return null;
}

async function collectProxies() {
  const set = new Set();
  for (const p of (process.env.TOFFEE_PROXY_URLS || process.env.HLS_KEY_PROXY_URLS || '').split(',')) {
    const t = p.trim();
    if (t) set.add(t.includes('://') ? t : `http://${t}`);
  }
  const sources = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=all',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt',
  ];
  await Promise.all(
    sources.map(async (src) => {
      try {
        const res = await fetch(src, { timeout: 12_000 });
        if (!res.ok) return;
        const text = await res.text();
        for (const line of text.split(/\r?\n/)) {
          const m = line.trim().match(/(\d+\.\d+\.\d+\.\d+:\d+)/);
          if (!m) continue;
          if (/socks5/i.test(src)) set.add(`socks5://${m[1]}`);
          else set.add(`http://${m[1]}`);
        }
      } catch {
        /* ignore */
      }
    })
  );
  return Array.from(set).slice(0, 100);
}

function agentForProxy(proxyUrl) {
  if (/^socks/i.test(proxyUrl)) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

async function fetchKeyViaProxy(keyUrl, proxyUrl) {
  try {
    const agent = agentForProxy(proxyUrl);
    const res = await fetch(keyUrl, {
      agent,
      timeout: 10_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://bozztv.com/',
        Origin: 'https://bozztv.com',
        Accept: '*/*',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (looksLikeKey(buf)) return buf.subarray(0, 16);
  } catch {
    return null;
  }
  return null;
}

/**
 * Ensure we have an AES key for the given key URL. May take several seconds
 * while hunting proxies the first time.
 */
export async function ensureAesKey(keyUrl = DEFAULT_KEY_URL) {
  const cached = getCachedAesKey(keyUrl);
  if (cached) return cached;

  const direct = await fetchKeyDirect(keyUrl);
  if (direct) {
    setCachedAesKey(keyUrl, direct);
    return direct;
  }

  // Deduplicate concurrent hunts
  if (huntInFlight) return huntInFlight;
  if (Date.now() - lastHuntAt < 60_000) return null;

  huntInFlight = (async () => {
    lastHuntAt = Date.now();
    console.log('[aes-key] hunting key via free proxies…');
    const proxies = await collectProxies();
    const batchSize = 12;
    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((p) => fetchKeyViaProxy(keyUrl, p)));
      const hit = results.find(Boolean);
      if (hit) {
        setCachedAesKey(keyUrl, hit);
        return hit;
      }
    }
    console.warn('[aes-key] hunt failed — set HLS_AES_KEY_HEX or HLS_KEY_PROXY_URLS');
    return null;
  })().finally(() => {
    huntInFlight = null;
  });

  return huntInFlight;
}

/** AES-128-CBC decrypt HLS segment (PKCS#7 padding removed). */
export function decryptHlsSegment(encrypted, key, iv) {
  if (!encrypted?.length || !key?.length || !iv?.length) return encrypted;
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key.subarray(0, 16), iv.subarray(0, 16));
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (err) {
    // Some packagers omit PKCS padding; try raw
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key.subarray(0, 16), iv.subarray(0, 16));
      decipher.setAutoPadding(false);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch {
      console.warn('[aes-key] decrypt failed:', err.message);
      return encrypted;
    }
  }
}

export function parseKeyIvFromPlaylist(playlistText = '') {
  const keyMatch = playlistText.match(/#EXT-X-KEY:[^\n]+/i);
  if (!keyMatch) return null;
  const line = keyMatch[0];
  const uri = line.match(/URI="([^"]+)"/i)?.[1];
  const ivHex = line.match(/IV=0x([0-9a-fA-F]+)/i)?.[1];
  if (!uri) return null;
  return {
    keyUrl: uri,
    iv: ivHex ? Buffer.from(ivHex.padStart(32, '0').slice(-32), 'hex') : null,
    method: line.match(/METHOD=([^,]+)/i)?.[1] || 'AES-128',
  };
}

/** Strip EXT-X-KEY lines so the player treats the playlist as clear. */
export function stripExtXKey(playlistText = '') {
  return playlistText
    .split('\n')
    .filter((l) => !/^#EXT-X-KEY:/i.test(l.trim()))
    .join('\n');
}

// Background warm-up shortly after boot
setTimeout(() => {
  ensureAesKey(DEFAULT_KEY_URL).catch(() => {});
}, 5000);

export default {
  getCachedAesKey,
  setCachedAesKey,
  ensureAesKey,
  decryptHlsSegment,
  parseKeyIvFromPlaylist,
  stripExtXKey,
  DEFAULT_KEY_URL,
};
