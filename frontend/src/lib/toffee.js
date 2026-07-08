import Hls, { FetchLoader } from 'hls.js';
import { apiPost } from './config.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export function isToffeeStream(url = '', source = '') {
  return (
    source === 'toffee'
    || /toffeelive\.com|cdn-tt\.pages\.dev|sm-monirul\.top/i.test(url)
  );
}

export function isRelayEntry(url = '') {
  return /cdn-tt\.pages\.dev|sm-monirul\.top/i.test(url);
}

export function isDirectCdn(url = '') {
  return /bldcmprod-cdn\.toffeelive\.com|mprod-cdn\.toffeelive\.com|prod-cdn01-live\.toffeelive\.com/i.test(url);
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia?.('(pointer: coarse)').matches;
}

function withSession(basePath, sessionId = '') {
  if (!sessionId) return basePath;
  return `${basePath}&sid=${encodeURIComponent(sessionId)}`;
}

export function buildToffeeSourceUrl(url, sessionId = '') {
  if (isRelayEntry(url)) {
    const referer = encodeURIComponent(window.location.origin);
    return withSession(
      `/api/toffee-proxy/manifest?url=${encodeURIComponent(url)}&referer=${referer}`,
      sessionId
    );
  }

  if (isDirectCdn(url) || /toffeelive\.com/i.test(url)) {
    return withSession(`/api/toffee-cdn?url=${encodeURIComponent(url)}`, sessionId);
  }

  return url;
}

export async function createToffeeSession(channelHeaders = {}) {
  try {
    const res = await apiPost('/api/toffee/session', { headers: channelHeaders });
    return res.sessionId || '';
  } catch {
    return '';
  }
}

export async function prepareToffeePlayback(url, channelHeaders = {}) {
  const sessionId = await createToffeeSession(channelHeaders);
  return {
    sessionId,
    sourceUrl: buildToffeeSourceUrl(url, sessionId),
  };
}

export function createToffeeHlsConfig() {
  return {
    loader: FetchLoader,
    lowLatencyMode: true,
    enableWorker: false,
    maxBufferSize: 30 * 1024 * 1024,
    maxBufferLength: 30,
    fragLoadingMaxRetry: 6,
    manifestLoadingMaxRetry: 4,
    levelLoadingMaxRetry: 4,
    fetchSetup: (context, initParams) => new Request(context.url, {
      method: initParams?.method || 'GET',
      mode: 'same-origin',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: initParams?.signal,
    }),
  };
}

export function mobileToffeeHelp(swActive) {
  if (swActive) {
    return 'Use Bangladesh mobile data (not VPN). Set Private DNS to Automatic. Close all tabs for this site and reopen if it still fails.';
  }
  return 'Tap "Enable Streams" on the player, wait for reload, then play again. Turn off VPN and Private DNS overrides.';
}