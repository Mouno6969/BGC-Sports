// ---------------------------------------------------------------------------
// Channels API — serves the full sports channel database from channels.json
// Automatically filters out dead channels detected by the health-check service.
//
// GET  /api/channels         -> all channels (dead filtered)
// GET  /api/channels/sports  -> sports channels only (dead filtered)
// GET  /api/channels/groups  -> list of available groups
// GET  /api/channels/featured -> curated featured channels (dead filtered)
// POST /api/channels/report-dead -> report a stream as dead from the player
// GET  /api/channels/health-status -> admin: view dead channel stats
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { filterDead, reportDead, getDeadCount, getDeadUrls, startHealthCheckLoop } from '../utils/healthCheck.js';
import { requireAdmin } from './admin.js';
import { fetchToffeeChannels } from '../utils/toffeeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Load channels data at startup
let channels = [];
try {
  const dataPath = join(__dirname, '..', 'data', 'channels.json');
  channels = JSON.parse(readFileSync(dataPath, 'utf-8'));
  console.log(`[channels] Loaded ${channels.length} channels from database`);
} catch (err) {
  console.error('[channels] Failed to load channels.json:', err.message);
}

// Start the health-check loop (passes a getter so it always uses current channels)
startHealthCheckLoop(() => channels);

// GET /api/channels — return all channels, optionally filtered by group or search
// Dead channels are automatically excluded.
router.get('/', async (req, res) => {
  const toffee = await fetchToffeeChannels();
  const allChannels = [...channels, ...toffee];
  let result = filterDead(allChannels);
  const { group, search, limit } = req.query;

  if (group && group !== 'all') {
    result = result.filter(
      (ch) => ch.group && ch.group.toLowerCase() === group.toLowerCase()
    );
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (ch) =>
        (ch.name && ch.name.toLowerCase().includes(q)) ||
        (ch.group && ch.group.toLowerCase().includes(q))
    );
  }

  if (limit) {
    result = result.slice(0, parseInt(limit, 10));
  }

  res.json({ ok: true, count: result.length, channels: result });
});

// GET /api/channels/sports — sports + live channels only (dead filtered)
router.get('/sports', (req, res) => {
  const sports = filterDead(channels).filter(
    (ch) =>
      ch.group &&
      (ch.group.toLowerCase() === 'sports' || ch.group.toLowerCase() === 'live')
  );
  res.json({ ok: true, count: sports.length, channels: sports });
});

// GET /api/channels/groups — list all available groups with counts
router.get('/groups', (req, res) => {
  const alive = filterDead(channels);
  const groups = {};
  alive.forEach((ch) => {
    const g = ch.group || 'Other';
    groups[g] = (groups[g] || 0) + 1;
  });
  const list = Object.entries(groups)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ ok: true, groups: list });
});

// GET /api/channels/featured — curated featured channels for homepage (dead filtered)
router.get('/featured', (req, res) => {
  const featured = filterDead(channels)
    .filter(
      (ch) =>
        ch.group &&
        (ch.group.toLowerCase() === 'sports' || ch.group.toLowerCase() === 'live') &&
        ch.logo &&
        ch.logo.startsWith('http')
    )
    .slice(0, 12);
  res.json({ ok: true, channels: featured });
});

// POST /api/channels/report-dead — player reports a stream as dead
// Called automatically when the HLS player hits a fatal error.
router.post('/report-dead', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ ok: false, error: 'Missing url in request body' });
  }
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  reportDead(url, () => channels, ip);
  res.json({ ok: true, message: 'Stream reported as dead' });
});

// GET /api/channels/health-status — admin debug endpoint
router.get('/health-status', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    deadCount: getDeadCount(),
    deadUrls: getDeadUrls(),
  });
});

export default router;
