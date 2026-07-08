import { ToffeeErrorCode, ToffeeRequestError } from './errors.js';

export function classifyFetchError(error, meta = {}) {
  const message = error?.message || 'Unknown fetch error';
  const lower = message.toLowerCase();

  if (lower.includes('enotfound') || lower.includes('no address associated')) {
    return new ToffeeRequestError(
      ToffeeErrorCode.DNS_FAILURE,
      'Target host is unreachable from this network. Toffee CDN requires a Bangladesh connection or configured upstream proxy.',
      { ...meta, cause: message }
    );
  }
  if (lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('network')) {
    return new ToffeeRequestError(ToffeeErrorCode.NETWORK_FAILURE, message, { ...meta, cause: message });
  }
  if (lower.includes('tls') || lower.includes('certificate') || lower.includes('ssl')) {
    return new ToffeeRequestError(ToffeeErrorCode.TLS_FAILURE, message, { ...meta, cause: message });
  }
  if (lower.includes('proxy')) {
    return new ToffeeRequestError(ToffeeErrorCode.PROXY_FAILURE, message, { ...meta, cause: message });
  }

  return new ToffeeRequestError(ToffeeErrorCode.UNKNOWN, message, { ...meta, cause: message });
}

export function classifyHttpResponse(status, bodyText = '', meta = {}) {
  if (status === 401 || status === 403) {
    return new ToffeeRequestError(
      ToffeeErrorCode.AUTH_FAILURE,
      `Upstream rejected request with HTTP ${status}`,
      { ...meta, status, bodyPreview: bodyText.slice(0, 200) }
    );
  }
  if (status === 429) {
    return new ToffeeRequestError(ToffeeErrorCode.RATE_LIMIT, 'Upstream rate limited the request', { ...meta, status });
  }
  if (status >= 500) {
    return new ToffeeRequestError(ToffeeErrorCode.SERVER_ERROR, `Upstream server error ${status}`, { ...meta, status });
  }
  return new ToffeeRequestError(ToffeeErrorCode.UNKNOWN, `Unexpected upstream status ${status}`, { ...meta, status });
}