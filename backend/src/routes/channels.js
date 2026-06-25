// ---------------------------------------------------------------------------
// Channels API — serves the full sports channel database from channels.json
// GET /api/channels         -> all channels
// GET /api/channels/sports  -> sports channels only
// GET /api/channels/groups  -> list of available groups
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// GET /api/channels — return all channels, optionally filtered by group or search
router.get('/', (req, res) => {
  let result = channels;
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

// GET /api/channels/sports — sports + live channels only
router.get('/sports', (req, res) => {
  const sports = channels.filter(
    (ch) =>
      ch.group &&
      (ch.group.toLowerCase() === 'sports' || ch.group.toLowerCase() === 'live')
  );
  res.json({ ok: true, count: sports.length, channels: sports });
});

// GET /api/channels/groups — list all available groups with counts
router.get('/groups', (req, res) => {
  const groups = {};
  channels.forEach((ch) => {
    const g = ch.group || 'Other';
    groups[g] = (groups[g] || 0) + 1;
  });
  const list = Object.entries(groups)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ ok: true, groups: list });
});

// GET /api/channels/featured — curated featured channels for homepage
router.get('/featured', (req, res) => {
  const featured = channels
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

export default router;
