export async function testBrowserToffeePath(sourceUrl) {
  try {
    const res = await fetch(sourceUrl, { cache: 'no-store', credentials: 'same-origin' });
    const text = await res.text();
    return {
      ok: res.ok && text.includes('#EXTM3U'),
      status: res.status,
      viaServiceWorker: res.headers.get('x-toffee-proxy') === 'service-worker',
      preview: text.slice(0, 80),
    };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

export async function resetStreamHelper() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.includes('toffee')).map((key) => caches.delete(key)));
  }
  window.location.reload();
}

export function streamSetupSteps() {
  return [
    'Use Bangladesh mobile data (turn off VPN and Wi‑Fi if it uses a VPN)',
    'Settings → Network → Private DNS → set to Automatic (not Cloudflare or Google)',
    'Tap "Enable Streams" and wait for the page to reload',
    'If it still fails, tap "Reset Stream Helper" and try again',
  ];
}