import { ACTIVE_STATUSES, Event, Registration } from '../models/index.js';
import { ageOn } from '../utils/age.js';
import { parseEventId } from '../utils/ids.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/errors.js';
import { newPassToken } from '../utils/tokens.js';
import { checkSubmission } from '../utils/registrationForm.js';
import { publishSeats } from '../realtime/socket.js';
import { notifyUsers } from './notifications.service.js';

async function rollbackSeat(eventId, status) {
  if (status === 'confirmed') await Event.updateOne({ _id: eventId }, { $inc: { registeredCount: -1 } });
  if (status === 'waitlisted') await Event.updateOne({ _id: eventId }, { $inc: { waitlistCount: -1 } });
}

/**
 * Registers a participant. Seat allocation is a single conditional update on the event document
 * (`registeredCount < capacity`), so two people racing for the last seat cannot both win.
 * Overflow goes to the waitlist in first-come order when the event allows it.
 */
export async function registerForEvent({ eventId, user, submission, now = new Date() }) {
  const event = await Event.findById(parseEventId(eventId));
  if (!event) throw notFound('Event not found');
  if (event.status !== 'published') throw conflict('This event is not open for registration.');
  if (event.registration?.type === 'external') {
    throw badRequest('This event registers on the organiser’s website. Use the external registration link instead.');
  }
  if (event.startAt <= now) throw conflict('This event has already started.');
  if (event.registrationDeadline && now > event.registrationDeadline) {
    throw conflict('The registration deadline has passed.');
  }
  if (event.minAge > 0) {
    if (!user.dateOfBirth) {
      throw unprocessable(
        `Add your date of birth in your profile to register. This event requires participants aged ${event.minAge} or above.`,
      );
    }
    if (ageOn(user.dateOfBirth, now) < event.minAge) {
      throw forbidden(`This event requires participants aged ${event.minAge} or above.`);
    }
  }

  const existing = await Registration.findOne({ event: event._id, user: user._id });
  if (existing && ACTIVE_STATUSES.includes(existing.status)) {
    throw conflict('You are already registered for this event.', { status: existing.status });
  }

  // The form is checked before any seat is claimed, so an invalid submission never holds a seat.
  const details = checkSubmission(event.registration?.toObject ? event.registration.toObject() : event.registration ?? {}, submission, now);

  const capacity = event.registration?.capacity ?? null;
  let status;
  if (capacity === null) {
    await Event.updateOne({ _id: event._id }, { $inc: { registeredCount: 1 } });
    status = 'confirmed';
  } else {
    const seat = await Event.updateOne(
      { _id: event._id, registeredCount: { $lt: capacity } },
      { $inc: { registeredCount: 1 } },
    );
    if (seat.matchedCount === 1) {
      status = 'confirmed';
    } else if (event.registration.waitlistEnabled) {
      await Event.updateOne({ _id: event._id }, { $inc: { waitlistCount: 1 } });
      status = 'waitlisted';
    } else {
      throw conflict('This event is full.');
    }
  }

  let registration;
  try {
    if (existing) {
      // Re-joining after a cancellation reuses the document and moves you to the back of the queue.
      existing.status = status;
      existing.queuedAt = now;
      existing.promotedAt = null;
      existing.reminderSentAt = null;
      Object.assign(existing, details);
      registration = await existing.save();
    } else {
      registration = await Registration.create({
        event: event._id,
        user: user._id,
        status,
        passToken: newPassToken(),
        queuedAt: now,
        ...details,
      });
    }
  } catch (err) {
    await rollbackSeat(event._id, status);
    if (err.code === 11000) throw conflict('You are already registered for this event.');
    throw err;
  }

  let position = null;
  if (status === 'waitlisted') {
    position = await Registration.countDocuments({
      event: event._id,
      status: 'waitlisted',
      queuedAt: { $lte: registration.queuedAt },
    });
  }
  await notifyUsers([user._id], {
    type: 'registration',
    title: status === 'confirmed' ? `You're registered: ${event.title}` : `Waitlisted: ${event.title}`,
    body:
      status === 'confirmed'
        ? 'Open your plan to show the QR pass at check-in.'
        : `You are #${position} on the waitlist. We will notify you if a seat opens.`,
    link: `/events/${event._id}`,
  });
  await publishSeats(event._id);
  return { registration, position };
}

export async function cancelRegistration({ eventId, user, now = new Date() }) {
  const event = await Event.findById(parseEventId(eventId));
  if (!event) throw notFound('Event not found');
  const registration = await Registration.findOne({
    event: event._id,
    user: user._id,
    status: { $in: ACTIVE_STATUSES },
  });
  if (!registration) throw notFound('You do not have an active registration for this event.');
  if (registration.checkedInAt) {
    throw conflict('You have already checked in, so this registration cannot be cancelled.');
  }
  if (event.startAt <= now) throw conflict('Registrations cannot be cancelled after the event has started.');

  const wasConfirmed = registration.status === 'confirmed';
  registration.status = 'cancelled';
  await registration.save();
  await Event.updateOne(
    { _id: event._id },
    wasConfirmed ? { $inc: { registeredCount: -1 } } : { $inc: { waitlistCount: -1 } },
  );
  if (wasConfirmed) await promoteWaitlist(event._id, now);
  await publishSeats(event._id);
  return registration;
}

/**
 * Moves the earliest waitlisted people into any free seats. Each promotion is an atomic
 * seat claim followed by an atomic status change, so the count never exceeds capacity.
 */
export async function promoteWaitlist(eventId, now = new Date()) {
  const event = await Event.findById(eventId);
  if (!event || event.status !== 'published') return [];
  const capacity = event.registration?.capacity ?? null;
  const promoted = [];

  for (;;) {
    const seat =
      capacity === null
        ? await Event.updateOne({ _id: event._id }, { $inc: { registeredCount: 1 } })
        : await Event.updateOne(
            { _id: event._id, registeredCount: { $lt: capacity } },
            { $inc: { registeredCount: 1 } },
          );
    if (seat.matchedCount !== 1) break;

    const next = await Registration.findOneAndUpdate(
      { event: event._id, status: 'waitlisted' },
      { status: 'confirmed', promotedAt: now },
      { sort: { queuedAt: 1 }, returnDocument: 'after' },
    );
    if (!next) {
      await Event.updateOne({ _id: event._id }, { $inc: { registeredCount: -1 } });
      break;
    }
    await Event.updateOne({ _id: event._id }, { $inc: { waitlistCount: -1 } });
    promoted.push(next);
  }

  if (promoted.length) {
    await notifyUsers(
      promoted.map((r) => r.user),
      {
        type: 'promotion',
        title: `A seat opened up: ${event.title}`,
        body: 'You moved from the waitlist to confirmed. Your QR pass is ready in your plan.',
        link: `/events/${event._id}`,
      },
    );
    await publishSeats(event._id);
  }
  return promoted;
}

/** Organizer check-in by pass token. Only confirmed registrations check in, and only once. */
export async function checkInPass({ event, passToken, now = new Date() }) {
  const reg = await Registration.findOne({ event: event._id, passToken }).populate('user', 'name email');
  if (!reg) throw notFound('No registration matches this pass for this event.');
  if (reg.status !== 'confirmed') {
    throw conflict(
      reg.status === 'waitlisted' ? 'This person is still on the waitlist.' : 'This registration was cancelled.',
      { status: reg.status },
    );
  }
  if (reg.checkedInAt) {
    throw conflict(`Already checked in at ${reg.checkedInAt.toISOString()}.`, {
      checkedInAt: reg.checkedInAt.toISOString(),
    });
  }
  const updated = await Registration.findOneAndUpdate(
    { _id: reg._id, checkedInAt: null, status: 'confirmed' },
    { checkedInAt: now },
    { returnDocument: 'after' },
  ).populate('user', 'name email');
  if (!updated) throw conflict('Already checked in.');
  await Event.updateOne({ _id: event._id }, { $inc: { checkedInCount: 1 } });
  return updated;
}
