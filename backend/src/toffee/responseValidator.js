import { ToffeeErrorCode, ToffeeRequestError } from './errors.js';

export function validateBinaryResponse(buffer, meta = {}) {
  if (!buffer || buffer.length === 0) {
    throw new ToffeeRequestError(ToffeeErrorCode.EMPTY_RESPONSE, 'Upstream returned an empty body', meta);
  }
  return buffer;
}

export function validateManifest(text, meta = {}) {
  if (!text || !text.trim()) {
    throw new ToffeeRequestError(ToffeeErrorCode.EMPTY_RESPONSE, 'Manifest body is empty', meta);
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new ToffeeRequestError(ToffeeErrorCode.HTML_RESPONSE, 'Expected HLS manifest but received HTML', meta);
  }
  if (/captcha|cf-browser-verification|attention required/i.test(trimmed)) {
    throw new ToffeeRequestError(ToffeeErrorCode.CAPTCHA_RESPONSE, 'Anti-bot challenge detected', meta);
  }
  if (!trimmed.includes('#EXTM3U')) {
    throw new ToffeeRequestError(ToffeeErrorCode.MALFORMED_MANIFEST, 'Response is not a valid HLS manifest', meta);
  }

  return text;
}