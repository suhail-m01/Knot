import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { announcementSchema, checkInSchema, idParam, importDiscoverSchema, importLinkSchema, instantSchema } from '../validation/schemas.js';
import { loadManagedEvent } from '../services/events.service.js';
import { checkInPass } from '../services/registrations.service.js';
import {
  attendeesCsv,
  attendeesFor,
  listAnnouncements,
  organizerEvents,
  parseInstantDraft,
  organizerStats,
  postAnnouncement,
} from '../services/organizer.service.js';
import { discoverFromSource, importEventLink } from '../services/portalImport.service.js';
import { listApprovedSources } from '../importers/sources.js';
import { serializeEvent } from '../utils/serialize.js';

const router = Router();

// Every organizer route requires an organizer or admin session. Ownership is checked per event.
router.use(requireAuth, requireRole('organizer', 'admin'));

router.get('/events', async (req, res) => {
  res.json({ items: await organizerEvents(req.user) });
});

router.post('/instant/parse', validate(instantSchema), async (req, res) => {
  res.json(await parseInstantDraft(req.valid.body));
});

// Portal import. Only sources enabled in the approved policy are listed or read. Results are drafts for review.
router.get('/import/sources', (_req, res) => {
  res.json({ items: listApprovedSources() });
});

router.get('/import/discover', validate(importDiscoverSchema, 'query'), async (req, res) => {
  res.json({ items: await discoverFromSource(req.valid.query.source) });
});

router.post('/import/link', validate(importLinkSchema), async (req, res) => {
  res.json(await importEventLink(req.valid.body.url, { localityId: req.valid.body.localityId ?? null }));
});

router.get('/stats', async (req, res) => {
  res.json({ stats: await organizerStats(req.user) });
});

router.get('/events/:id/attendees', validate(idParam, 'params'), async (req, res) => {
  const event = await loadManagedEvent(req.valid.params.id, req.user);
  res.json({ event: serializeEvent(event.toObject(), { includeOwnerFields: true }), attendees: await attendeesFor(event._id) });
});

router.get('/events/:id/attendees.csv', validate(idParam, 'params'), async (req, res) => {
  const event = await loadManagedEvent(req.valid.params.id, req.user);
  const rows = await attendeesFor(event._id);
  res.attachment(`knot-attendees-${event._id}.csv`);
  res.type('text/csv; charset=utf-8').send(attendeesCsv(rows));
});

router.post('/events/:id/checkin', validate(idParam, 'params'), validate(checkInSchema), async (req, res) => {
  const event = await loadManagedEvent(req.valid.params.id, req.user);
  const reg = await checkInPass({ event, passToken: req.valid.body.passToken });
  res.json({
    attendee: {
      id: String(reg._id),
      name: reg.user?.name ?? 'Participant',
      status: reg.status,
      checkedInAt: reg.checkedInAt.toISOString(),
    },
  });
});

router.get('/events/:id/announcements', validate(idParam, 'params'), async (req, res) => {
  const event = await loadManagedEvent(req.valid.params.id, req.user);
  res.json({ items: await listAnnouncements(event._id) });
});

router.post('/events/:id/announcements', validate(idParam, 'params'), validate(announcementSchema), async (req, res) => {
  const event = await loadManagedEvent(req.valid.params.id, req.user);
  const announcement = await postAnnouncement(event, req.user, req.valid.body.message);
  res.status(201).json({
    announcement: {
      id: String(announcement._id),
      message: announcement.message,
      recipients: announcement.recipients,
      createdAt: announcement.createdAt.toISOString(),
    },
  });
});

export default router;
