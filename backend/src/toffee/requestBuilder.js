import { buildBrowserHeaders } from './headerNormalizer.js';
import { getSessionHeaders } from './cookieManager.js';

export function buildToffeeRequest(targetUrl, incomingHeaders = {}, options = {}) {
  const method = options.method || 'GET';
  const sessionHeaders = getSessionHeaders(targetUrl, incomingHeaders);
  const headers = buildBrowserHeaders(targetUrl, sessionHeaders);

  return {
    url: targetUrl,
    method,
    headers,
    sessionHeaders,
  };
}