function intEnv(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const toffeeConfig = {
  proxyUrls: (process.env.TOFFEE_PROXY_URLS || process.env.TOFFEE_PROXY_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  connectTimeoutMs: intEnv('TOFFEE_CONNECT_TIMEOUT_MS', 12_000),
  requestTimeoutMs: intEnv('TOFFEE_REQUEST_TIMEOUT_MS', 20_000),
  maxRetries: intEnv('TOFFEE_MAX_RETRIES', 3),
  retryBaseMs: intEnv('TOFFEE_RETRY_BASE_MS', 400),
  defaultReferer: process.env.TOFFEE_REFERER || 'https://www.toffee.live/',
  defaultUserAgent:
    process.env.TOFFEE_USER_AGENT
    || 'Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  acceptLanguage: process.env.TOFFEE_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,bn;q=0.8',
  clientHintUa:
    process.env.TOFFEE_SEC_CH_UA
    || '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"',
};