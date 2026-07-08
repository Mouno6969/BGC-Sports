import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { toffeeConfig } from './config.js';
import { createToffeeLogger } from './logger.js';
import { buildToffeeRequest } from './requestBuilder.js';
import { updateSessionFromResponse } from './cookieManager.js';
import { nextProxy, markProxyDead, hasProxies } from './proxyRouter.js';
import { withRetries } from './retryHandler.js';
import { classifyFetchError, classifyHttpResponse } from './errorClassifier.js';
import { validateBinaryResponse, validateManifest } from './responseValidator.js';
import { ToffeeErrorCode, ToffeeRequestError } from './errors.js';

function decodeHeadersParam(encoded) {
  if (!encoded) return {};
  try {
    const json = Buffer.from(String(encoded), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function executeFetch(requestSpec, meta) {
  const started = Date.now();
  const proxy = hasProxies() ? nextProxy() : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), toffeeConfig.requestTimeoutMs);

  try {
    const response = await fetch(requestSpec.url, {
      method: requestSpec.method,
      headers: requestSpec.headers,
      redirect: 'follow',
      signal: controller.signal,
      agent: proxy?.agent,
    });

    const latencyMs = Date.now() - started;
    meta.logger.info('upstream_response', {
      requestId: meta.requestId,
      status: response.status,
      latencyMs,
      proxyId: proxy?.id || 'direct',
      redirectCount: response.redirected ? 1 : 0,
      targetHost: new URL(requestSpec.url).hostname,
    });

    updateSessionFromResponse(requestSpec.url, response.headers);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw classifyHttpResponse(response.status, text, {
        requestId: meta.requestId,
        url: requestSpec.url,
      });
    }

    return response;
  } catch (error) {
    if (proxy?.url) markProxyDead(proxy.url);
    if (error?.name === 'ToffeeRequestError') throw error;
    if (error?.name === 'AbortError') {
      throw new ToffeeRequestError(ToffeeErrorCode.NETWORK_FAILURE, 'Upstream request timed out', {
        requestId: meta.requestId,
        url: requestSpec.url,
      });
    }
    throw classifyFetchError(error, { requestId: meta.requestId, url: requestSpec.url });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchToffeeResource({
  url,
  headers = {},
  encodedHeaders = '',
  expect = 'binary',
}) {
  const requestId = randomUUID();
  const logger = createToffeeLogger({ requestId, sessionId: 'toffee-default' });
  const mergedHeaders = { ...decodeHeadersParam(encodedHeaders), ...headers };
  const requestSpec = buildToffeeRequest(url, mergedHeaders);

  logger.info('request_start', {
    targetHost: new URL(url).hostname,
    expect,
    hasCookie: Boolean(requestSpec.headers.Cookie),
    hasClientApiHeader: Boolean(requestSpec.headers['client-api-header']),
    proxyConfigured: hasProxies(),
  });

  const response = await withRetries(
    () => executeFetch(requestSpec, { requestId, logger }),
    { maxRetries: toffeeConfig.maxRetries }
  );

  if (expect === 'manifest') {
    const text = await response.text();
    validateManifest(text, { requestId, url });
    return {
      body: text,
      contentType: response.headers.get('content-type') || 'application/vnd.apple.mpegurl',
      requestId,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  validateBinaryResponse(buffer, { requestId, url });
  return {
    body: buffer,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    requestId,
  };
}

export function mapPipelineErrorToStatus(error) {
  if (!(error instanceof ToffeeRequestError)) return 502;
  switch (error.code) {
    case ToffeeErrorCode.AUTH_FAILURE:
      return 403;
    case ToffeeErrorCode.RATE_LIMIT:
      return 429;
    case ToffeeErrorCode.DNS_FAILURE:
    case ToffeeErrorCode.NETWORK_FAILURE:
    case ToffeeErrorCode.PROXY_FAILURE:
    case ToffeeErrorCode.TLS_FAILURE:
      return 502;
    default:
      return error.meta?.status || 502;
  }
}