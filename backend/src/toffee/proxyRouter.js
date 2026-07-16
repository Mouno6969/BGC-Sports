import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toffeeConfig } from './config.js';
import {
  hasWorkingProxy,
  markProxyFailed,
  markProxyOk,
  nextWorkingProxy,
} from './proxyPool.js';

function buildAgent(proxyUrl) {
  if (/^socks/i.test(proxyUrl)) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
}

export function listProxies() {
  return toffeeConfig.proxyUrls;
}

export function hasProxies() {
  return hasWorkingProxy() || (toffeeConfig.proxyUrls || []).length > 0;
}

export function nextProxy() {
  const fromPool = nextWorkingProxy();
  if (fromPool) return fromPool;

  const proxies = toffeeConfig.proxyUrls || [];
  if (!proxies.length) return null;
  const proxyUrl = proxies[0];
  return { id: 'config-0', url: proxyUrl, agent: buildAgent(proxyUrl) };
}

export function markProxyDead(proxyUrl, cooldownMs = 60_000) {
  markProxyFailed(proxyUrl);
}

export function noteProxySuccess(proxyUrl) {
  markProxyOk(proxyUrl);
}
