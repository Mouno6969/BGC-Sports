// ---------------------------------------------------------------------------
// Admin routes — password-protected control of the global stream URL.
//
// Auth model (MVP): the admin panel sends the admin password in the
// "x-admin-password" header. We compare it to ADMIN_PASSWORD. This is simple
// and stateless; for production behind HTTPS this is acceptable for an MVP,
// but consider issuing a short-lived signed token instead.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { config } from '../config/index.js';
import { getStream, setStream } from '../utils/streamStore.js';

const router = Router();

/** Middleware: require a valid admin password header. */
export function requireAdmin(req, res, next) {
  const provided = req.header('x-admin-password') || '';
  if (provided !== config.adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/admin/login — verify password without changing anything.
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== config.adminPassword) {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }
  res.json({ ok: true });
});

// GET /api/admin/stream — read current stream (admin view).
router.get('/stream', requireAdmin, (req, res) => {
  res.json({ ok: true, stream: getStream() });
});

// POST /api/admin/stream — update the global stream URL/type.
router.post('/stream', requireAdmin, (req, res) => {
  const { url, type } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'A valid url is required' });
  }
  const stream = setStream({ url, type });

  // Broadcast the new stream to all connected clients via Socket.IO.
  // `req.app.get('io')` is set in server.js.
  const io = req.app.get('io');
  if (io) io.emit('stream:update', stream);

  res.json({ ok: true, stream });
});

export default router;
