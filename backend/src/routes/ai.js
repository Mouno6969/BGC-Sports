// ---------------------------------------------------------------------------
// AI API Routes — Health check, status, and admin endpoints for the BGC AI.
//
// GET /api/ai/status        -> AI agent info and provider status
// GET /api/ai/health        -> Quick health check
// POST /api/ai/query        -> Direct AI query (for testing/admin)
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { getAgentInfo, processQuery } from '../ai/index.js';
import { getProviderStatus } from '../ai/aiProvider.js';

const router = Router();

// Public: Get AI agent info and capabilities
router.get('/status', (_req, res) => {
  const info = getAgentInfo();
  const providers = getProviderStatus();
  const configuredCount = providers.filter((p) => p.configured).length;

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
  });
});

// Public: Quick health check
router.get('/health', (_req, res) => {
  const providers = getProviderStatus();
  const hasProvider = providers.some((p) => p.configured);

  res.json({
    ok: true,
    aiEnabled: hasProvider,
    configuredProviders: providers.filter((p) => p.configured).length,
  });
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
