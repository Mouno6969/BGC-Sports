// ---------------------------------------------------------------------------
// Profile / watch-stats API — optional cloud backup for device profiles.
//
// GET  /api/profile/stats?userId=   — fetch synced snapshot
// POST /api/profile/stats           — upsert watch history / badges / favorites
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { upsertUserStats, getUserStats } from '../utils/userStatsStore.js';

const router = Router();

router.get('/stats', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const stats = getUserStats(userId);
  if (!stats) return res.json({ ok: true, stats: null });
  res.json({ ok: true, stats });
});

router.post('/stats', (req, res) => {
  const result = upsertUserStats(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

export default router;
