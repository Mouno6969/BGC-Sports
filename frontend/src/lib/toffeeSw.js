const SW_URL = '/toffee-sw.js?v=10';

function normalizeHeaders(raw = {}) {
  const out = {};
  const map = {
    cookie: 'Cookie',
    host: 'Host',
    'user-agent': 'User-Agent',
    'client-api-header': 'client-api-header',
    referer: 'Referer',
  };

  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'null') continue;
    const name = map[key.toLowerCase()] || key;
    out[name] = text;
  }

  if (!out.Referer) out.Referer = 'https://www.toffee.live/';
  if (!out['User-Agent']) {
    out['User-Agent'] = 'Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  }
  return out;
}

async function pushHeadersToWorker(headers) {
  const registration = await navigator.serviceWorker.ready;
  const payload = { type: 'SET_TOFFEE_HEADERS', headers };

  const workers = [
    registration.active,
    registration.waiting,
    registration.installing,
    navigator.serviceWorker.controller,
  ].filter(Boolean);

  for (const worker of workers) {
    worker.postMessage(payload);
  }

  if ('caches' in window) {
    try {
      const cache = await caches.open('toffee-auth-v1');
      await cache.put('auth.json', new Response(JSON.stringify(headers)));
    } catch {
      // ignore
    }
  }
}

export function isServiceWorkerSupported() {
  return 'serviceWorker' in navigator;
}

export function isServiceWorkerControlling() {
  return Boolean(navigator.serviceWorker?.controller);
}

export async function bootstrapToffeeServiceWorker() {
  if (!isServiceWorkerSupported()) {
    return { supported: false, controlling: false, registered: false };
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      updateViaCache: 'none',
    });
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    await navigator.serviceWorker.ready;
    return {
      supported: true,
      controlling: isServiceWorkerControlling(),
      registered: true,
    };
  } catch (err) {
    console.warn('[toffee-sw] bootstrap failed:', err);
    return { supported: true, controlling: false, registered: false, error: err.message };
  }
}

export async function ensureToffeeServiceWorker(channelHeaders = {}) {
  if (!isServiceWorkerSupported()) {
    return { ready: false, controlling: false, needsReload: false };
  }

  try {
    const headers = normalizeHeaders(channelHeaders);
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      updateViaCache: 'none',
    });

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    await navigator.serviceWorker.ready;
    await pushHeadersToWorker(headers);

    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3500);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
      await pushHeadersToWorker(headers);
    }

    const controlling = Boolean(navigator.serviceWorker.controller);
    return {
      ready: controlling,
      controlling,
      needsReload: !controlling,
    };
  } catch (err) {
    console.warn('[toffee-sw] registration failed:', err);
    return { ready: false, controlling: false, needsReload: false, error: err.message };
  }
}

export async function reloadForServiceWorker() {
  window.location.reload();
}