// Recurring event automation, ported from the original Knot domain (src/domain/series.ts).
const DAY = 86_400_000;

/** Next occurrence for a weekly or monthly series. Monthly keeps the day, clamped to the month's length. */
export function nextSeriesDate(value, frequency) {
  const date = new Date(value);
  if (frequency === 'weekly') return new Date(date.getTime() + 7 * DAY).toISOString();
  const next = new Date(date);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next.toISOString();
}

const shift = (value, milliseconds) => (value ? new Date(new Date(value).getTime() + milliseconds) : null);

/**
 * Builds the fields for a new draft from a template event. Only operational content is copied:
 * registrations, check-ins, counters and safety declarations are never carried over.
 * @param {object} template plain event object (lean document)
 * @param {string|Date} scheduledFor start time of the new occurrence
 */
export function cloneEventFields(template, scheduledFor) {
  if (!template.organizer) throw new Error('Series automation requires an owned template.');
  const offset = new Date(scheduledFor).getTime() - new Date(template.startAt).getTime();
  return {
    title: template.title,
    summary: template.summary ?? '',
    description: template.description ?? '',
    eventType: template.eventType,
    mode: template.mode,
    interests: [...(template.interests ?? [])],
    organizer: template.organizer,
    organizerName: template.organizerName,
    startAt: new Date(scheduledFor),
    endAt: shift(template.endAt, offset),
    timezone: template.timezone ?? 'Asia/Kolkata',
    registrationDeadline: shift(template.registrationDeadline, offset),
    venue: template.venue ? { ...template.venue } : undefined,
    onlineUrl: template.onlineUrl ?? null,
    registration: { ...(template.registration ?? {}), type: template.registration?.type ?? 'native' },
    price: { ...(template.price ?? {}) },
    minAge: template.minAge ?? 0,
    status: 'draft',
    cancelledReason: null,
    registeredCount: 0,
    waitlistCount: 0,
    checkedInCount: 0,
    externalHandoffs: 0,
  };
}
