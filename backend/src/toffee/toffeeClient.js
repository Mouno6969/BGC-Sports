import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { toffeeConfig } from './config.js';
import { createToffeeLogger } from './logger.js';
import { buildToffeeRequest } from './requestBuilder.js';
import { updateSessionFromResponse } from './cookieManager.js';
import { nextProxy, markProxyDead, hasProxies, noteProxySuccess } from './proxyRouter.js';
import { ensureToffeeProxies } from './proxyPool.js';
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

function needsProxyEgress(url = '') {
  // Toffee CDN hostnames often fail public DNS outside BD
  return /toffeelive\.com/i.test(url);
}

async function singleFetch(requestSpec, meta, proxy) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), toffeeConfig.requestTimeoutMs);

  try {
    const response = await fetch(requestSpec.url, {
      method: requestSpec.method,
      headers: {
        ...requestSpec.headers,
        // Avoid compressed bodies that some free proxies mangle
        'Accept-Encoding': 'identity',
      },
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
      if (proxy?.url) markProxyDead(proxy.url);
      const text = await response.text().catch(() => '');
      throw classifyHttpResponse(response.status, text, {
        requestId: meta.requestId,
        url: requestSpec.url,
      });
    }

    if (proxy?.url) noteProxySuccess(proxy.url);
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

/**
 * Try up to N known proxies before giving up (no rediscover inside).
 */
async function executeFetch(requestSpec, meta, { forceProxy = false, attempts = 3 } = {}) {
  const wantProxy = forceProxy || hasProxies() || needsProxyEgress(requestSpec.url);
  let lastError = null;

  for (let i = 0; i < attempts; i += 1) {
    const proxy = wantProxy ? nextProxy() : null;
    if (wantProxy && !proxy) {
      lastError = new ToffeeRequestError(
        ToffeeErrorCode.DNS_FAILURE,
        'Target host is unreachable from this network. Toffee CDN requires a Bangladesh connection or configured upstream proxy.',
        { requestId: meta.requestId, url: requestSpec.url }
      );
      break;
    }
    try {
      return await singleFetch(requestSpec, meta, proxy);
    } catch (err) {
      lastError = err;
      // try next proxy
    }
  }

  throw lastError || new ToffeeRequestError(
    ToffeeErrorCode.NETWORK_FAILURE,
    'All Toffee egress attempts failed',
    { requestId: meta.requestId, url: requestSpec.url }
  );
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

  // Ensure BD egress proxies are warm before hitting geo-DNS CDN
  if (needsProxyEgress(url)) {
    try {
      await ensureToffeeProxies({
        testUrl: url.includes('playlist.m3u8') || url.includes('.m3u8')
          ? url
          : undefined,
        headers: requestSpec.headers,
        force: !hasProxies(),
      });
    } catch (err) {
      logger.info('proxy_warm_failed', { error: err.message });
    }
  }

  logger.info('request_start', {
    targetHost: new URL(url).hostname,
    expect,
    hasCookie: Boolean(requestSpec.headers.Cookie),
    hasClientApiHeader: Boolean(requestSpec.headers['client-api-header']),
    proxyConfigured: hasProxies(),
  });

  let response;
  try {
    response = await executeFetch(
      requestSpec,
      { requestId, logger },
      { forceProxy: needsProxyEgress(url), attempts: 4 }
    );
  } catch (err) {
    // One rediscover + retry (rate-limited inside ensureToffeeProxies)
    if (
      needsProxyEgress(url)
      && (err?.code === ToffeeErrorCode.DNS_FAILURE
        || err?.code === ToffeeErrorCode.NETWORK_FAILURE
        || err?.code === ToffeeErrorCode.PROXY_FAILURE)
    ) {
      try {
        await ensureToffeeProxies({
          testUrl: url.includes('.m3u8') ? url : undefined,
          headers: requestSpec.headers,
          force: true,
        });
      } catch {
        /* ignore */
      }
      response = await executeFetch(
        requestSpec,
        { requestId, logger },
        { forceProxy: true, attempts: 3 }
      );
    } else {
      throw err;
    }
  }

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