// ---------------------------------------------------------------------------
// AI API Routes — Health check, status, and admin endpoints for the BGC AI.
//
// GET /api/ai/status        -> AI agent info and provider status
// GET /api/ai/health        -> Quick health check
// POST /api/ai/query        -> Direct AI query (for testing/admin)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import {
  getAgentInfo,
  processQuery,
  getWebSearchStatus,
  webSearch,
  getTranslatorStatus,
  prepareUserMessage,
  translateText,
} from '../ai/index.js';
import { getProviderStatus } from '../ai/aiProvider.js';

const router = Router();

// Public: Get AI agent info and capabilities
router.get('/status', (_req, res) => {
  const info = getAgentInfo();
  const providers = getProviderStatus();
  const configuredCount = providers.filter((p) => p.configured).length;
  const webSearchProviders = getWebSearchStatus();
  const webSearchConfigured = webSearchProviders.filter((p) => p.configured).length;
  const translator = getTranslatorStatus();

  res.json({
    ok: true,
    agent: info,
    providers: {
      total: providers.length,
      configured: configuredCount,
      list: providers.map((p) => ({
        name: p.displayName,
        model: p.model,
        available: p.configured,
      })),
    },
    webSearch: {
      total: webSearchProviders.length,
      configured: webSearchConfigured,
      enabled: webSearchConfigured > 0,
      list: webSearchProviders.map((p) => ({
        name: p.displayName,
        available: p.configured,
      })),
    },
    translator,
  });
});

// Public: Quick health check
router.get('/health', (_req, res) => {
  const providers = getProviderStatus();
  const hasProvider = providers.some((p) => p.configured);
  const webSearchProviders = getWebSearchStatus();
  const webSearchConfigured = webSearchProviders.filter((p) => p.configured).length;
  const translator = getTranslatorStatus();

  res.json({
    ok: true,
    aiEnabled: hasProvider,
    configuredProviders: providers.filter((p) => p.configured).length,
    webSearchEnabled: webSearchConfigured > 0,
    webSearchProviders: webSearchConfigured,
    translatorEnabled: translator.enabled,
  });
});

// Admin: Test web search only (requires admin password)
router.post('/search', async (req, res) => {
  const { q, adminKey } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme-admin-password';
  if (adminKey !== adminPassword) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  if (!q || String(q).trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Missing "q" field' });
  }
  try {
    const result = await webSearch(String(q));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Test translator (detect + optional translate)
router.post('/translate', async (req, res) => {
  const { q, source, target, adminKey } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme-admin-password';
  if (adminKey !== adminPassword) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  if (!q || String(q).trim().length < 1) {
    return res.status(400).json({ ok: false, error: 'Missing "q" field' });
  }
  try {
    if (target) {
      const result = await translateText(String(q), source || 'auto', String(target));
      return res.json({ ok: true, mode: 'translate', ...result });
    }
    const prepared = await prepareUserMessage(String(q));
    res.json({ ok: true, mode: 'prepare', ...prepared });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Direct AI query for testing (requires admin password)
router.post('/query', async (req, res) => {
  const { text, username, adminKey } = req.body;

  // Simple admin auth check
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme-admin-password';
  if (adminKey !== adminPassword) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (!text) {
    return res.status(400).json({ ok: false, error: 'Missing "text" field' });
  }

  try {
    const result = await processQuery(
      `@bgc ${text}`,
      username || 'admin-test',
      username || 'Admin'
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
