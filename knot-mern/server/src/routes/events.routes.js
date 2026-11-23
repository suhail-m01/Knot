import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, discoverQuery, idParam, reasonSchema, registrationSubmitSchema, updateEventSchema } from '../validation/schemas.js';
import { serializeEvent, serializeRegistration } from '../utils/serialize.js';
import { buildIcs } from '../utils/ics.js';
import { notFound } from '../utils/errors.js';
import { Event } from '../models/index.js';
import {
  cancelEvent,
  createEvent,
  getEventDetail,
  listEvents,
  recordExternalHandoff,
  recommendedEvents,
  toggleSaved,
  updateEvent,
} from '../services/events.service.js';
import { parseEventId } from '../utils/ids.js';
import { cancelRegistration, registerForEvent } from '../services/registrations.service.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/', optionalAuth, validate(discoverQuery, 'query'), async (req, res) => {
  res.json(await listEvents(req.valid.query));
});

router.get('/recommended', requireAuth, async (req, res) => {
  res.json({ items: await recommendedEvents(req.user) });
});

router.post('/', requireAuth, requireRole('organizer', 'admin'), validate(createEventSchema), async (req, res) => {
  const event = await createEvent(req.valid.body, req.user);
  res.status(201).json({ event: serializeEvent(event.toObject(), { includeOwnerFields: true }) });
});

router.get('/:id', optionalAuth, async (req, res) => {
  res.json(await getEventDetail(parseEventId(req.params.id), req.user));
});

router.patch('/:id', requireAuth, validate(idParam, 'params'), validate(updateEventSchema), async (req, res) => {
  const event = await updateEvent(req.valid.params.id, req.valid.body, req.user);
  res.json({ event: serializeEvent(event.toObject(), { includeOwnerFields: true }) });
});

router.post('/:id/cancel', requireAuth, validate(idParam, 'params'), validate(reasonSchema), async (req, res) => {
  const event = await cancelEvent(req.valid.params.id, req.valid.body.reason, req.user);
  res.json({ event: serializeEvent(event.toObject(), { includeOwnerFields: true }) });
});

router.get('/:id/ics', async (req, res) => {
  const id = parseEventId(req.params.id);
  const event = await Event.findById(id).lean();
  if (!event || event.status === 'draft') throw notFound('Event not found');
  const url = `${env.PUBLIC_URL}/events/${id}`;
  const ics = buildIcs(serializeEvent(event), { url });
  res.attachment(`knot-${id}.ics`);
  res.type('text/calendar; charset=utf-8').send(ics);
});

// Outbound click on an external registration. This is a handoff, never a registration.
router.post('/:id/handoff', async (req, res) => {
  res.json(await recordExternalHandoff(parseEventId(req.params.id)));
});

router.post('/:id/register', requireAuth, validate(registrationSubmitSchema), async (req, res) => {
  const { registration, position } = await registerForEvent({
    eventId: req.params.id,
    user: req.user,
    submission: req.valid.body,
  });
  res.status(201).json({
    registration: serializeRegistration(registration, { includePass: true }),
    position,
  });
});

router.delete('/:id/register', requireAuth, async (req, res) => {
  const registration = await cancelRegistration({ eventId: req.params.id, user: req.user });
  res.json({ registration: serializeRegistration(registration) });
});

router.put('/:id/save', requireAuth, async (req, res) => {
  const event = await Event.findById(parseEventId(req.params.id), { _id: 1 }).lean();
  if (!event) throw notFound('Event not found');
  await toggleSaved(req.user._id, event._id, true);
  res.json({ saved: true });
});

router.delete('/:id/save', requireAuth, async (req, res) => {
  await toggleSaved(req.user._id, parseEventId(req.params.id), false);
  res.json({ saved: false });
});

export default router;
