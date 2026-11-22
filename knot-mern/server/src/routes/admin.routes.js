import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, reasonSchema, roleSchema } from '../validation/schemas.js';
import { listUsers, platformStats, setRole } from '../services/admin.service.js';
import { cancelEvent } from '../services/events.service.js';
import { Event } from '../models/index.js';
import { serializeEvent } from '../utils/serialize.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/stats', async (req, res) => {
  res.json({ stats: await platformStats() });
});

router.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : undefined;
  res.json({ items: await listUsers({ q }) });
});

router.patch('/users/:id/role', validate(idParam, 'params'), validate(roleSchema), async (req, res) => {
  res.json({ user: await setRole(req.valid.params.id, req.valid.body.role, req.user) });
});

router.get('/events', async (req, res) => {
  const docs = await Event.find({}).sort({ startAt: -1 }).limit(200).lean();
  res.json({ items: docs.map((d) => serializeEvent(d, { includeOwnerFields: true })) });
});

// Moderation takedown: cancels any event and notifies its registered people.
router.post('/events/:id/takedown', validate(idParam, 'params'), validate(reasonSchema), async (req, res) => {
  const reason = req.valid.body.reason || 'Removed by Knot moderation';
  const event = await cancelEvent(req.valid.params.id, reason, req.user);
  res.json({ event: serializeEvent(event.toObject(), { includeOwnerFields: true }) });
});

export default router;
