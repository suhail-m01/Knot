import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notificationIdParam } from '../validation/schemas.js';
import { listNotifications, markAllRead, markRead } from '../services/notifications.service.js';
import { notFound } from '../utils/errors.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await listNotifications(req.user._id));
});

router.post('/read-all', async (req, res) => {
  res.json({ updated: await markAllRead(req.user._id) });
});

router.patch('/:id/read', validate(notificationIdParam, 'params'), async (req, res) => {
  const notification = await markRead(req.user._id, req.valid.params.id);
  if (!notification) throw notFound('Notification not found');
  res.json({ notification });
});

export default router;
