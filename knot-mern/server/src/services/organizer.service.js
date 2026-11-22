import mongoose from 'mongoose';
import { ACTIVE_STATUSES, Announcement, Event, Registration } from '../models/index.js';
import { serializeEvent } from '../utils/serialize.js';
import { toCsv } from '../utils/csv.js';
import { notifyUsers } from './notifications.service.js';

import { parseInstantText } from '../utils/instantParser.js';
import { findDuplicateCandidates } from '../utils/dedupe.js';

export async function organizerEvents(user) {
  const docs = await Event.find({ organizer: user._id }).sort({ startAt: -1 }).lean();
  return docs.map((d) => serializeEvent(d, { includeOwnerFields: true }));
}

/** Totals across the organizer's events, computed from the denormalised counters. */
export async function organizerStats(user, now = new Date()) {
  const events = await Event.find({ organizer: user._id }, {
    status: 1,
    startAt: 1,
    registeredCount: 1,
    waitlistCount: 1,
    checkedInCount: 1,
    externalHandoffs: 1,
  }).lean();
  const totals = events.reduce(
    (acc, e) => {
      acc.registrations += e.registeredCount ?? 0;
      acc.waitlisted += e.waitlistCount ?? 0;
      acc.checkedIn += e.checkedInCount ?? 0;
      acc.externalHandoffs += e.externalHandoffs ?? 0;
      if (e.status === 'published' && e.startAt >= now) acc.upcoming += 1;
      if (e.status === 'draft') acc.drafts += 1;
      return acc;
    },
    { registrations: 0, waitlisted: 0, checkedIn: 0, externalHandoffs: 0, upcoming: 0, drafts: 0 },
  );
  const checkInRate = totals.registrations > 0 ? Math.round((totals.checkedIn / totals.registrations) * 100) : null;
  return { events: events.length, ...totals, checkInRate };
}

export async function attendeesFor(eventId) {
  const regs = await Registration.find({ event: eventId, status: { $in: [...ACTIVE_STATUSES, 'cancelled'] } })
    .sort({ status: 1, queuedAt: 1 })
    .populate('user', 'name email')
    .lean();
  return regs.map((r) => ({
    id: String(r._id),
    name: r.user?.name ?? 'Deleted account',
    email: r.user?.email ?? '',
    status: r.status,
    queuedAt: r.queuedAt ? new Date(r.queuedAt).toISOString() : null,
    checkedInAt: r.checkedInAt ? new Date(r.checkedInAt).toISOString() : null,
    organisation: r.profile?.organisation ?? '',
    phone: r.profile?.phone ?? '',
    team: r.team?.name ?? '',
    teamMembers: (r.team?.members ?? []).map((m) => (m.email ? `${m.name} <${m.email}>` : m.name)).join('; '),
    answers: (r.answers ?? []).map((a) => ({ label: a.label, value: a.value })),
    answersText: (r.answers ?? []).map((a) => `${a.label}: ${a.value}`).join(' | '),
    dataSharing: r.consent?.dataSharing ? 'yes' : 'no',
  }));
}

export function attendeesCsv(rows) {
  return toCsv(rows, [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
    { key: 'queuedAt', label: 'Registered at' },
    { key: 'checkedInAt', label: 'Checked in at' },
    { key: 'phone', label: 'Phone' },
    { key: 'organisation', label: 'Organisation' },
    { key: 'team', label: 'Team' },
    { key: 'teamMembers', label: 'Team members' },
    { key: 'dataSharing', label: 'Agreed to share details' },
    { key: 'answersText', label: 'Answers' },
  ]);
}

export async function postAnnouncement(event, author, message) {
  const recipients = await Registration.find(
    { event: event._id, status: { $in: ACTIVE_STATUSES } },
    { user: 1 },
  ).lean();
  const announcement = await Announcement.create({
    event: event._id,
    author: author._id,
    message,
    recipients: recipients.length,
  });
  await notifyUsers(
    recipients.map((r) => r.user),
    {
      type: 'announcement',
      title: `From ${event.organizerName}: ${event.title}`,
      body: message,
      link: `/events/${event._id}`,
    },
  );
  return announcement;
}

export async function listAnnouncements(eventId) {
  const docs = await Announcement.find({ event: new mongoose.Types.ObjectId(String(eventId)) })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return docs.map((a) => ({
    id: String(a._id),
    message: a.message,
    recipients: a.recipients,
    createdAt: new Date(a.createdAt).toISOString(),
  }));
}

/**
 * Instant Add: parses pasted event text into a draft for the event form. Nothing is saved here.
 * Possible duplicates are checked against upcoming published events.
 */
export async function parseInstantDraft({ text, localityId = null }, now = new Date()) {
  const { fields, form } = parseInstantText(text, now);
  const candidate = {
    title: form.title,
    startAt: form.startAt,
    mode: form.mode || 'in_person',
    onlineUrl: form.onlineUrl,
    registration: { externalUrl: form.externalUrl },
    venue: { localityId },
  };
  const existing = candidate.startAt
    ? await Event.find({ status: 'published', startAt: { $gte: new Date(now.getTime() - 2 * 86_400_000) } })
        .sort({ startAt: 1 })
        .limit(1000)
        .lean()
    : [];
  const duplicates = candidate.startAt && candidate.title
    ? findDuplicateCandidates(candidate, existing).map((doc) => ({
        id: String(doc._id),
        title: doc.title,
        startAt: doc.startAt.toISOString(),
        status: doc.status,
      }))
    : [];
  return { fields, form, duplicates, localityChecked: Boolean(localityId) };
}
