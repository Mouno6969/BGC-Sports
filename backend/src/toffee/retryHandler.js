import { toffeeConfig } from './config.js';
import { ToffeeErrorCode } from './errors.js';

const RETRYABLE = new Set([
  ToffeeErrorCode.NETWORK_FAILURE,
  ToffeeErrorCode.PROXY_FAILURE,
  ToffeeErrorCode.SERVER_ERROR,
  ToffeeErrorCode.RATE_LIMIT,
]);

export async function withRetries(task, { maxRetries = toffeeConfig.maxRetries, baseMs = toffeeConfig.retryBaseMs } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const code = error?.code;
      if (!RETRYABLE.has(code) || attempt >= maxRetries) break;
      const delay = baseMs * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }

  throw lastError;
}