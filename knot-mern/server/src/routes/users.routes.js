import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { profileSchema, userIdParam } from '../validation/schemas.js';
import { Locality, User } from '../models/index.js';
import { serializeUser } from '../utils/serialize.js';
import { badRequest, notFound } from '../utils/errors.js';
import { buildPlan, publicOrganizer } from '../services/user.service.js';
import { isObjectIdString } from '../utils/text.js';

const router = Router();

router.patch('/me', requireAuth, validate(profileSchema), async (req, res) => {
  const input = req.valid.body;
  if (input.localityId) {
    const exists = await Locality.exists({ _id: input.localityId });
    if (!exists) throw badRequest('Unknown locality.');
  }
  const update = {};
  for (const key of ['name', 'dateOfBirth', 'interests', 'localityId']) {
    if (input[key] !== undefined) update[key] = input[key];
  }
  const user = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after' });
  res.json({ user: serializeUser(user) });
});

router.get('/me/plan', requireAuth, async (req, res) => {
  res.json(await buildPlan(req.user));
});

router.put('/following/:userId', requireAuth, validate(userIdParam, 'params'), async (req, res) => {
  const target = await User.findOne({ _id: req.valid.params.userId, role: { $in: ['organizer', 'admin'] } }, { _id: 1 });
  if (!target) throw notFound('Organizer not found');
  await User.updateOne({ _id: req.user._id }, { $addToSet: { following: target._id } });
  res.json({ following: true });
});

router.delete('/following/:userId', requireAuth, validate(userIdParam, 'params'), async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { following: req.valid.params.userId } });
  res.json({ following: false });
});

router.get('/organizers/:id', async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound('Organizer not found');
  const organizer = await publicOrganizer(req.params.id);
  if (!organizer) throw notFound('Organizer not found');
  res.json({ organizer });
});

export default router;
