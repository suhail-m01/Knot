import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, teardownTestDb } from './helpers.js';

let models;
let jobs;

before(async () => {
  ({ models } = await setupTestDb());
  jobs = await import('../src/jobs/index.js');
});

after(async () => {
  await teardownTestDb();
});

describe('scheduled jobs', () => {
  test('past events are marked ended; upcoming events are left alone', async () => {
    const organizer = await models.User.create({
      name: 'Job Organizer',
      email: 'job-org@example.com',
      passwordHash: 'x',
      role: 'organizer',
    });
    const base = {
      title: 'Job Test Event',
      organizer: organizer._id,
      organizerName: organizer.name,
      mode: 'online',
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    };
    const now = new Date('2026-11-22T12:00:00Z');
    const past = await models.Event.create({ ...base, startAt: new Date('2026-11-20T10:00:00Z'), endAt: new Date('2026-11-20T12:00:00Z') });
    const noEnd = await models.Event.create({ ...base, startAt: new Date('2026-11-21T01:00:00Z'), endAt: null });
    const future = await models.Event.create({ ...base, startAt: new Date('2026-12-01T10:00:00Z'), endAt: null });

    const ended = await jobs.closeEndedEvents(now);
    assert.equal(ended, 2);
    assert.equal((await models.Event.findById(past._id)).status, 'ended');
    assert.equal((await models.Event.findById(noEnd._id)).status, 'ended');
    assert.equal((await models.Event.findById(future._id)).status, 'published');
  });

  test('start reminders go once to confirmed attendees within 24 hours', async () => {
    const organizer = await models.User.create({ name: 'Remind Org', email: 'remind-org@example.com', passwordHash: 'x', role: 'organizer' });
    const attendee = await models.User.create({ name: 'Remind Attendee', email: 'remind-att@example.com', passwordHash: 'x' });
    const now = new Date('2026-11-22T12:00:00Z');
    const soon = await models.Event.create({
      title: 'Starts Tomorrow',
      organizer: organizer._id,
      organizerName: organizer.name,
      startAt: new Date('2026-11-23T06:00:00Z'),
      mode: 'online',
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    });
    await models.Registration.create({ event: soon._id, user: attendee._id, status: 'confirmed', passToken: 'a'.repeat(24) });

    assert.equal(await jobs.sendStartReminders(now), 1);
    assert.equal(await jobs.sendStartReminders(now), 0, 'reminder must not be sent twice');
    const notes = await models.Notification.find({ user: attendee._id, type: 'reminder' });
    assert.equal(notes.length, 1);
  });

  test('cron expression validation rejects garbage', () => {
    assert.throws(() => jobs.startJobs('not a cron'), /Invalid JOB_CRON/);
  });
});
