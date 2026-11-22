import { checkInPayload } from './checkin.js';
// Converts Mongoose documents (or lean objects) into the JSON contract used by the React client.
// Internal fields such as passwordHash, versionKey and raw tokens are never exposed by accident.

const iso = (value) => (value ? new Date(value).toISOString() : null);

export function hasVenue(venue) {
  return Boolean(venue && (venue.name || venue.address || venue.localityId || venue.lat != null));
}

export function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    dateOfBirth: iso(user.dateOfBirth),
    interests: user.interests ?? [],
    localityId: user.localityId ?? null,
    following: (user.following ?? []).map(String),
    savedEventIds: (user.savedEvents ?? []).map(String),
    createdAt: iso(user.createdAt),
  };
}

export function serializeNotification(n) {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body ?? '',
    link: n.link ?? '',
    readAt: iso(n.readAt),
    createdAt: iso(n.createdAt),
  };
}

export function serializeRegistration(reg, { includePass = false } = {}) {
  const eventRef = reg.event;
  const eventId = eventRef && eventRef._id ? String(eventRef._id) : String(eventRef);
  return {
    id: String(reg._id),
    eventId,
    status: reg.status,
    queuedAt: iso(reg.queuedAt),
    promotedAt: iso(reg.promotedAt),
    checkedInAt: iso(reg.checkedInAt),
    createdAt: iso(reg.createdAt),
    ...(includePass ? { passToken: reg.passToken, checkInPayload: checkInPayload(reg.passToken) } : {}),
  };
}

/**
 * @param {object} e event document or lean object
 * @param {{ distanceKm?: number|null, includeOwnerFields?: boolean }} options
 */
export function serializeEvent(e, { distanceKm, includeOwnerFields = false } = {}) {
  const capacity = e.registration?.capacity ?? null;
  const registeredCount = e.registeredCount ?? 0;
  const venue = hasVenue(e.venue)
    ? {
        name: e.venue.name ?? '',
        address: e.venue.address ?? '',
        localityId: e.venue.localityId ?? null,
        lat: e.venue.lat ?? null,
        lng: e.venue.lng ?? null,
      }
    : null;

  const base = {
    id: String(e._id),
    title: e.title,
    summary: e.summary ?? '',
    description: e.description ?? '',
    eventType: e.eventType,
    mode: e.mode,
    interests: e.interests ?? [],
    organizer: { id: String(e.organizer), name: e.organizerName },
    startAt: iso(e.startAt),
    endAt: iso(e.endAt),
    timezone: e.timezone ?? 'Asia/Kolkata',
    registrationDeadline: iso(e.registrationDeadline),
    status: e.status,
    venue,
    onlineUrl: e.onlineUrl ?? null,
    registration: {
      type: e.registration?.type ?? 'native',
      externalUrl: e.registration?.externalUrl ?? null,
      capacity,
      seatsLeft: capacity === null ? null : Math.max(0, capacity - registeredCount),
      waitlistEnabled: e.registration?.waitlistEnabled ?? true,
      form: {
        teamMin: e.registration?.teamMin ?? 0,
        teamMax: e.registration?.teamMax ?? 0,
        questions: (e.registration?.questions ?? []).map((q) => ({
          key: q.key,
          label: q.label,
          type: q.type,
          required: Boolean(q.required),
          options: [...(q.options ?? [])],
        })),
        declaration: e.registration?.declaration ?? '',
      },
    },
    registeredCount,
    waitlistCount: e.waitlistCount ?? 0,
    price: { kind: e.price?.kind ?? 'free', amountInr: e.price?.amountInr ?? null },
    minAge: e.minAge ?? 0,
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
  };

  if (distanceKm !== undefined) {
    base.distanceKm = distanceKm === null ? null : Math.round(distanceKm * 10) / 10;
  }
  if (includeOwnerFields) {
    base.checkedInCount = e.checkedInCount ?? 0;
    base.externalHandoffs = e.externalHandoffs ?? 0;
    base.cancelledReason = e.cancelledReason ?? null;
  }
  return base;
}
