import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toffeeConfig } from './config.js';

let proxyIndex = 0;
const deadProxies = new Map();

function buildAgent(proxyUrl) {
  if (/^socks/i.test(proxyUrl)) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

export function listProxies() {
  return toffeeConfig.proxyUrls;
}

export function hasProxies() {
  return toffeeConfig.proxyUrls.length > 0;
}

export function nextProxy() {
  const proxies = toffeeConfig.proxyUrls;
  if (!proxies.length) return null;

  for (let i = 0; i < proxies.length; i += 1) {
    const idx = (proxyIndex + i) % proxies.length;
    const proxyUrl = proxies[idx];
    const deadUntil = deadProxies.get(proxyUrl) || 0;
    if (Date.now() < deadUntil) continue;
    proxyIndex = idx + 1;
    return { id: `proxy-${idx}`, url: proxyUrl, agent: buildAgent(proxyUrl) };
  }

  return null;
}

export function markProxyDead(proxyUrl, cooldownMs = 60_000) {
  deadProxies.set(proxyUrl, Date.now() + cooldownMs);
}