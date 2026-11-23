import { ACTIVE_STATUSES, Event, Registration, User } from '../models/index.js';
import { boundingBox, haversineKm } from '../utils/geo.js';
import { textSearchScore } from '../utils/search.js';
import { parseEventId } from '../utils/ids.js';
import { serializeEvent, serializeRegistration } from '../utils/serialize.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/errors.js';
import { notifyUsers } from './notifications.service.js';
import { formDefinitionErrors } from '../utils/registrationForm.js';

// Geo search reads a bounded candidate set, then ranks by exact haversine distance.
const GEO_CANDIDATE_LIMIT = 1000;

export { parseEventId };

export function canManageEvent(event, user) {
  if (!user) return false;
  return user.role === 'admin' || String(event.organizer) === String(user._id ?? user.id);
}

export async function loadManagedEvent(id, user) {
  const event = await Event.findById(parseEventId(id));
  if (!event) throw notFound('Event not found');
  if (!canManageEvent(event, user)) throw forbidden('You can only manage events you organize');
  return event;
}

/** Builds the Mongo filter clauses for discovery. Each clause is ANDed together. */
function buildClauses(q, now) {
  const clauses = [];
  const range = {};
  if (q.from) range.$gte = q.from;
  else if (!q.includePast) range.$gte = now;
  if (q.to) range.$lte = q.to;
  if (Object.keys(range).length) clauses.push({ startAt: range });

  if (q.type?.length) clauses.push({ eventType: { $in: q.type } });
  if (q.mode?.length) clauses.push({ mode: { $in: q.mode } });
  if (q.interest) clauses.push({ interests: q.interest });
  if (q.price === 'free') clauses.push({ 'price.kind': 'free' });
  if (q.price === 'paid') clauses.push({ 'price.kind': 'paid' });
  if (q.locality) clauses.push({ 'venue.localityId': q.locality });
  // Free-text search is applied after loading candidates, so typos can still match (see listEvents).

  const hasGeo = Number.isFinite(q.lat) && Number.isFinite(q.lng);
  if (hasGeo) {
    const box = boundingBox(q.lat, q.lng, q.radiusKm);
    clauses.push({
      $or: [
        { mode: 'online' },
        {
          'venue.lat': { $gte: box.minLat, $lte: box.maxLat },
          'venue.lng': { $gte: box.minLng, $lte: box.maxLng },
        },
      ],
    });
  }
  return clauses;
}

export async function listEvents(q, now = new Date()) {
  const clauses = buildClauses(q, now);
  const filter = { status: 'published', ...(clauses.length ? { $and: clauses } : {}) };
  const hasGeo = Number.isFinite(q.lat) && Number.isFinite(q.lng);
  const hasText = Boolean(q.q);

  if (hasGeo || hasText) {
    const docs = await Event.find(filter).sort({ startAt: 1 }).limit(GEO_CANDIDATE_LIMIT).lean();
    const scored = docs
      .map((doc) => {
        const hasCoords = doc.venue?.lat != null && doc.venue?.lng != null;
        const distanceKm = hasGeo && hasCoords ? haversineKm(q.lat, q.lng, doc.venue.lat, doc.venue.lng) : null;
        const textScore = hasText
          ? textSearchScore(
              [doc.title, doc.summary, doc.description, doc.organizerName, doc.eventType.replaceAll('_', ' '), ...(doc.interests ?? [])],
              q.q,
            )
          : 0;
        return { doc, distanceKm, textScore };
      })
      .filter(({ doc, distanceKm, textScore }) => {
        if (hasText && textScore <= 0) return false;
        if (hasGeo) return doc.mode === 'online' || (distanceKm !== null && distanceKm <= q.radiusKm);
        return true;
      });

    scored.sort((a, b) => {
      if (hasText && a.textScore !== b.textScore) return b.textScore - a.textScore;
      if (hasGeo && q.sort === 'distance') {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da < db ? -1 : 1;
      }
      return a.doc.startAt - b.doc.startAt;
    });

    const total = scored.length;
    const start = (q.page - 1) * q.limit;
    const items = scored
      .slice(start, start + q.limit)
      .map(({ doc, distanceKm }) => serializeEvent(doc, { distanceKm }));
    return {
      items,
      page: q.page,
      limit: q.limit,
      total,
      hasMore: start + q.limit < total,
      ...(hasGeo ? { searchCentre: { lat: q.lat, lng: q.lng, radiusKm: q.radiusKm } } : {}),
    };
  }

  const sort = q.sort === 'newest' ? { createdAt: -1 } : { startAt: 1 };
  const [total, docs] = await Promise.all([
    Event.countDocuments(filter),
    Event.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
  ]);
  return {
    items: docs.map((doc) => serializeEvent(doc)),
    page: q.page,
    limit: q.limit,
    total,
    hasMore: q.page * q.limit < total,
  };
}

/** Simple explainable ranking: shared interests, same locality, free entry, and nearness in time. */
export async function recommendedEvents(user, now = new Date()) {
  const docs = await Event.find({ status: 'published', startAt: { $gte: now } })
    .sort({ startAt: 1 })
    .limit(300)
    .lean();
  const interests = new Set(user.interests ?? []);

  return docs
    .map((doc) => {
      const reasons = [];
      let score = 0;
      const shared = (doc.interests ?? []).filter((i) => interests.has(i));
      if (shared.length) {
        score += shared.length * 3;
        reasons.push(`Matches your interests: ${shared.join(', ')}`);
      }
      if (user.localityId && doc.venue?.localityId === user.localityId) {
        score += 2;
        reasons.push('Near your locality');
      }
      if (doc.price?.kind === 'free') score += 0.5;
      const daysAway = (doc.startAt - now) / 86400000;
      score += Math.max(0, 1 - daysAway / 30);
      return { doc, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.doc.startAt - b.doc.startAt)
    .slice(0, 12)
    .map(({ doc, reasons }) => ({ ...serializeEvent(doc), reasons }));
}

export async function getEventDetail(id, viewer, now = new Date()) {
  const event = await Event.findById(parseEventId(id)).lean();
  if (!event) throw notFound('Event not found');
  const manager = canManageEvent(event, viewer);
  if (event.status === 'draft' && !manager) throw notFound('Event not found');

  const payload = { event: serializeEvent(event, { includeOwnerFields: manager }) };
  if (viewer) {
    const [registration, organizer] = await Promise.all([
      Registration.findOne({ event: event._id, user: viewer._id, status: { $in: ACTIVE_STATUSES } }).lean(),
      User.findById(event.organizer, { name: 1 }).lean(),
    ]);
    payload.viewer = {
      registration: registration ? serializeRegistration(registration, { includePass: true }) : null,
      saved: (viewer.savedEvents ?? []).some((e) => String(e) === String(event._id)),
      followingOrganizer: (viewer.following ?? []).some((u) => String(u) === String(event.organizer)),
    };
    payload.organizerName = organizer?.name ?? event.organizerName;
  }
  payload.serverTime = now.toISOString();
  return payload;
}

const pickDefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const blank = (v) => (v === '' ? null : v);

/** Converts validated API input into a Mongoose `set` patch (dotted keys for nested fields). */
export function buildEventPatch(input) {
  const patch = {};
  for (const key of ['title', 'summary', 'description', 'eventType', 'mode', 'interests', 'minAge', 'status']) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = blank(input.endAt);
  if (input.registrationDeadline !== undefined) patch.registrationDeadline = blank(input.registrationDeadline);
  if (input.onlineUrl !== undefined) patch.onlineUrl = blank(input.onlineUrl);

  if (input.venue !== undefined) {
    const v = input.venue;
    patch.venue = v
      ? pickDefined({
          name: v.name ?? '',
          address: v.address ?? '',
          localityId: v.localityId ?? null,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
        })
      : { name: '', address: '', localityId: null, lat: null, lng: null };
  }
  if (input.registration) {
    for (const [key, value] of Object.entries(pickDefined(input.registration))) {
      patch[`registration.${key}`] = key === 'externalUrl' ? blank(value) : value;
    }
  }
  if (input.price) {
    for (const [key, value] of Object.entries(pickDefined(input.price))) {
      patch[`price.${key}`] = value;
    }
  }
  return patch;
}

function validateEventState(event) {
  if (event.endAt && event.startAt && event.endAt < event.startAt) {
    throw badRequest('The end time must be after the start time.');
  }
  const { type, externalUrl, capacity, waitlistEnabled } = event.registration ?? {};
  const formErrors = formDefinitionErrors(event.registration?.toObject ? event.registration.toObject() : event.registration ?? {});
  if (formErrors.length) throw unprocessable('The registration form needs fixing.', formErrors);
  if (type === 'external' && !externalUrl) {
    throw badRequest('External registration needs the organizer registration link.');
  }
  if (capacity != null && capacity < event.registeredCount) {
    throw badRequest(`Capacity cannot be lower than the ${event.registeredCount} people already confirmed.`);
  }
  if (waitlistEnabled === false && event.waitlistCount > 0 && capacity != null) {
    throw badRequest('Waitlisted people exist, so the waitlist cannot be turned off yet.');
  }
  const inPerson = event.mode === 'in_person' || event.mode === 'hybrid';
  if (inPerson && !event.venue?.localityId && (event.venue?.lat == null || event.venue?.lng == null)) {
    throw badRequest('In-person and hybrid events need a locality or map location.');
  }
  if (event.mode === 'online' && !event.onlineUrl && type !== 'external') {
    throw badRequest('Online events need a join link.');
  }
}

export async function createEvent(input, organizer) {
  const event = new Event();
  event.set({
    ...buildEventPatch(input),
    status: input.status ?? 'published',
    organizer: organizer._id,
    organizerName: organizer.name,
  });
  validateEventState(event);
  await event.save();
  return event;
}

export async function updateEvent(id, input, actor) {
  const event = await loadManagedEvent(id, actor);
  if (event.status === 'cancelled' || event.status === 'ended') {
    throw conflict(`This event is ${event.status} and can no longer be edited.`);
  }
  const before = {
    startAt: event.startAt?.toISOString(),
    endAt: event.endAt?.toISOString() ?? null,
    venue: [event.venue?.name, event.venue?.address, event.venue?.localityId].join('|'),
    onlineUrl: event.onlineUrl,
  };
  const patch = buildEventPatch(input);
  if (input.status === 'draft' && event.registeredCount > 0) {
    throw conflict('Events with confirmed participants cannot be moved back to draft.');
  }
  event.set(patch);
  validateEventState(event);
  await event.save();

  const materialChange =
    before.startAt !== event.startAt?.toISOString() ||
    before.endAt !== (event.endAt?.toISOString() ?? null) ||
    before.venue !== [event.venue?.name, event.venue?.address, event.venue?.localityId].join('|') ||
    before.onlineUrl !== event.onlineUrl;
  if (materialChange && event.registeredCount + event.waitlistCount > 0) {
    const people = await Registration.find({ event: event._id, status: { $in: ACTIVE_STATUSES } }, { user: 1 }).lean();
    await notifyUsers(people.map((p) => p.user), {
      type: 'change',
      title: `Updated: ${event.title}`,
      body: 'The time, venue or joining details changed. Check the event page for the latest information.',
      link: `/events/${event._id}`,
    });
  }
  return event;
}

export async function cancelEvent(id, reason, actor) {
  const event = await loadManagedEvent(id, actor);
  if (event.status === 'cancelled') throw conflict('This event is already cancelled.');
  if (event.status === 'ended') throw conflict('Ended events cannot be cancelled.');
  event.status = 'cancelled';
  event.cancelledReason = reason || 'Cancelled by the organizer';
  await event.save();

  const people = await Registration.find({ event: event._id, status: { $in: ACTIVE_STATUSES } }, { user: 1 }).lean();
  await notifyUsers(people.map((p) => p.user), {
    type: 'system',
    title: `Cancelled: ${event.title}`,
    body: event.cancelledReason,
    link: `/events/${event._id}`,
  });
  return event;
}

export async function recordExternalHandoff(id) {
  const event = await Event.findById(parseEventId(id));
  if (!event || event.status !== 'published') throw notFound('Event not found');
  if (event.registration?.type !== 'external' || !event.registration.externalUrl) {
    throw badRequest('This event uses Knot registration. There is no external link to open.');
  }
  // A handoff is an outbound click, not a registration or attendance. It is counted separately.
  await Event.updateOne({ _id: event._id }, { $inc: { externalHandoffs: 1 } });
  return { externalUrl: event.registration.externalUrl };
}

export function toggleSaved(userId, eventId, save) {
  return save
    ? User.updateOne({ _id: userId }, { $addToSet: { savedEvents: eventId } })
    : User.updateOne({ _id: userId }, { $pull: { savedEvents: eventId } });
}

export async function savedEventsFor(user, now = new Date()) {
  const docs = await Event.find({
    _id: { $in: user.savedEvents ?? [] },
    status: 'published',
    $or: [{ endAt: { $gte: now } }, { endAt: null, startAt: { $gte: now } }],
  })
    .sort({ startAt: 1 })
    .lean();
  return docs.map((d) => serializeEvent(d));
}

export function ensureEventDraftVisible(event, user) {
  if (event.status === 'draft' && !canManageEvent(event, user)) throw notFound('Event not found');
}
