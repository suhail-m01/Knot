import { ACTIVE_STATUSES, Event, Registration, User } from '../models/index.js';
import { serializeEvent, serializeRegistration } from '../utils/serialize.js';
import { findScheduleConflicts } from '../utils/schedule.js';

/**
 * The personal plan: registrations, saved events, schedule clashes and upcoming registration deadlines.
 * Conflicts count only confirmed seats, so waitlisted items never create false warnings.
 */
export async function buildPlan(user, now = new Date()) {
  const regs = await Registration.find({ user: user._id, status: { $in: ACTIVE_STATUSES } })
    .populate('event')
    .lean();

  const registrations = regs
    .filter((r) => r.event && (r.event.endAt ?? r.event.startAt) >= now && r.event.status !== 'draft')
    .sort((a, b) => a.event.startAt - b.event.startAt)
    .map((r) => ({
      registration: serializeRegistration(r, { includePass: true }),
      event: serializeEvent(r.event),
    }));

  const saved = (await Event.find({
    _id: { $in: user.savedEvents ?? [] },
    status: 'published',
    startAt: { $gte: now },
  })
    .sort({ startAt: 1 })
    .lean()).map((e) => serializeEvent(e));

  const confirmed = registrations.filter((r) => r.registration.status === 'confirmed');
  const conflicts = findScheduleConflicts(
    confirmed.map(({ event }) => ({ id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt })),
  );

  const deadlines = [...registrations.map((r) => r.event), ...saved]
    .filter((e) => e.registrationDeadline && new Date(e.registrationDeadline) >= now)
    .sort((a, b) => new Date(a.registrationDeadline) - new Date(b.registrationDeadline))
    .map((e) => ({ eventId: e.id, title: e.title, deadline: e.registrationDeadline }));

  return { registrations, saved, conflicts, deadlines };
}

export async function publicOrganizer(id, now = new Date()) {
  const organizer = await User.findOne({ _id: id, role: { $in: ['organizer', 'admin'] } }, { name: 1, role: 1 }).lean();
  if (!organizer) return null;
  const events = await Event.find({ organizer: organizer._id, status: 'published', startAt: { $gte: now } })
    .sort({ startAt: 1 })
    .limit(20)
    .lean();
  return {
    id: String(organizer._id),
    name: organizer.name,
    upcomingEvents: events.map((e) => serializeEvent(e)),
  };
}
