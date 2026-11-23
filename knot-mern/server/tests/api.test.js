import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, teardownTestDb, future, bearer } from './helpers.js';

let app;
let models;

async function register(name, email, role = 'participant', dateOfBirth = '2000-01-01') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Password123', role, dateOfBirth });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, user: res.body.user };
}

// A complete, valid registration submission (profile, consent). Forms with questions or teams need more.
const SUBMISSION = { profile: { name: 'Test Participant', phone: '', organisation: '' }, answers: [], consent: { terms: true, dataSharing: false } };

function eventBody(overrides = {}) {
  return {
    title: 'Knot Test Meetup',
    summary: 'Testing the full flow',
    description: 'Details',
    eventType: 'meetup',
    mode: 'in_person',
    interests: ['web-dev'],
    startAt: future(3),
    endAt: future(3, 2),
    venue: { name: 'Hub', address: '5th Block', localityId: 'koramangala', lat: 12.9357, lng: 77.6241 },
    registration: { type: 'native', capacity: 1, waitlistEnabled: true },
    price: { kind: 'free', amountInr: 0 },
    minAge: 0,
    ...overrides,
  };
}

before(async () => {
  ({ app, models } = await setupTestDb());
});

after(async () => {
  await teardownTestDb();
});

describe('auth', () => {
  test('register returns a token and a safe user object (no password hash)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Meera Test', email: 'MEERA@example.com', password: 'Password123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'meera@example.com');
    assert.equal(res.body.user.role, 'participant');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.ok(res.body.token);
  });

  test('duplicate email is rejected with 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Meera Again', email: 'meera@example.com', password: 'Password123' });
    assert.equal(res.status, 409);
  });

  test('wrong password returns 401 with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'meera@example.com', password: 'nope-nope' });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /incorrect/);
  });

  test('protected routes need a valid token', async () => {
    assert.equal((await request(app).get('/api/users/me/plan')).status, 401);
    assert.equal((await request(app).get('/api/users/me/plan').set('Authorization', 'Bearer bad.token.here')).status, 401);
  });

  test('validation errors list the problem fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'not-an-email', password: 'short' });
    assert.equal(res.status, 400);
    const paths = res.body.details.map((d) => d.path);
    assert.ok(paths.includes('name') && paths.includes('email') && paths.includes('password'));
  });
});

describe('registration, waitlist and check-in', () => {
  let organizer;
  let p1;
  let p2;
  let p3;
  let event;

  before(async () => {
    organizer = await register('Asha Organizer', 'asha@example.com', 'organizer');
    p1 = await register('Participant One', 'p1@example.com');
    p2 = await register('Participant Two', 'p2@example.com');
    p3 = await register('Participant Three', 'p3@example.com');
    const res = await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    event = res.body.event;
  });

  test('participants cannot create events', async () => {
    const res = await request(app).post('/api/events').set(bearer(p1.token)).send(eventBody());
    assert.equal(res.status, 403);
  });

  test('first person gets a confirmed seat with a pass token', async () => {
    const res = await request(app).post(`/api/events/${event.id}/register`).set(bearer(p1.token)).send(SUBMISSION);
    assert.equal(res.status, 201);
    assert.equal(res.body.registration.status, 'confirmed');
    assert.match(res.body.registration.passToken, /^[a-f0-9]{48}$/);
  });

  test('second person joins the waitlist with a position', async () => {
    const res = await request(app).post(`/api/events/${event.id}/register`).set(bearer(p2.token)).send(SUBMISSION);
    assert.equal(res.status, 201);
    assert.equal(res.body.registration.status, 'waitlisted');
    assert.equal(res.body.position, 1);
  });

  test('double registration is rejected', async () => {
    const res = await request(app).post(`/api/events/${event.id}/register`).set(bearer(p1.token)).send(SUBMISSION);
    assert.equal(res.status, 409);
  });

  test('event detail reflects seats and shows the viewer their pass', async () => {
    const res = await request(app).get(`/api/events/${event.id}`).set(bearer(p1.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.event.registeredCount, 1);
    assert.equal(res.body.event.waitlistCount, 1);
    assert.equal(res.body.event.registration.seatsLeft, 0);
    assert.equal(res.body.viewer.registration.status, 'confirmed');
    assert.ok(res.body.viewer.registration.passToken);
  });

  test('guests see the event but not the pass', async () => {
    const res = await request(app).get(`/api/events/${event.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.viewer, undefined);
  });

  test('when the confirmed person cancels, the first waitlisted person is promoted and notified', async () => {
    const cancel = await request(app).delete(`/api/events/${event.id}/register`).set(bearer(p1.token)).send(SUBMISSION);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.registration.status, 'cancelled');

    const detail = await request(app).get(`/api/events/${event.id}`).set(bearer(p2.token));
    assert.equal(detail.body.viewer.registration.status, 'confirmed');
    assert.equal(detail.body.event.registeredCount, 1);
    assert.equal(detail.body.event.waitlistCount, 0);

    const notes = await request(app).get('/api/notifications').set(bearer(p2.token));
    assert.ok(notes.body.items.some((n) => n.type === 'promotion'));
    assert.ok(notes.body.unreadCount >= 1);
  });

  test('organizer checks in with the pass; a second scan is refused; a wrong pass is 404', async () => {
    const plan = await request(app).get('/api/users/me/plan').set(bearer(p2.token));
    const pass = plan.body.registrations[0].registration.passToken;

    const first = await request(app)
      .post(`/api/organizer/events/${event.id}/checkin`)
      .set(bearer(organizer.token))
      .send({ passToken: pass });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.attendee.status, 'confirmed');

    const second = await request(app)
      .post(`/api/organizer/events/${event.id}/checkin`)
      .set(bearer(organizer.token))
      .send({ passToken: pass });
    assert.equal(second.status, 409);

    const wrong = await request(app)
      .post(`/api/organizer/events/${event.id}/checkin`)
      .set(bearer(organizer.token))
      .send({ passToken: 'ffffffffffffffffffffffff' });
    assert.equal(wrong.status, 404);
  });

  test('participants cannot access organizer tools', async () => {
    const res = await request(app).get(`/api/organizer/events/${event.id}/attendees`).set(bearer(p1.token));
    assert.equal(res.status, 403);
  });

  test('organizer announcement reaches confirmed attendees and appears in their notifications', async () => {
    const res = await request(app)
      .post(`/api/organizer/events/${event.id}/announcements`)
      .set(bearer(organizer.token))
      .send({ message: 'Doors open 15 minutes early. Bring your QR pass.' });
    assert.equal(res.status, 201);
    assert.equal(res.body.announcement.recipients, 1);
    const notes = await request(app).get('/api/notifications').set(bearer(p2.token));
    assert.ok(notes.body.items.some((n) => n.type === 'announcement' && n.body.includes('Doors open')));
  });

  test('attendee CSV export is an attachment with a header row', async () => {
    const res = await request(app).get(`/api/organizer/events/${event.id}/attendees.csv`).set(bearer(organizer.token));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /attachment/);
    assert.match(res.text, /^Name,Email,Status/);
    assert.match(res.text, /Participant Two/);
  });

  test('another organizer cannot manage this event; an admin can', async () => {
    const other = await register('Other Organizer', 'other@example.com', 'organizer');
    const denied = await request(app).get(`/api/organizer/events/${event.id}/attendees`).set(bearer(other.token));
    assert.equal(denied.status, 403);

    await models.User.updateOne({ email: 'other@example.com' }, { role: 'admin' });
    const admin = await request(app).get(`/api/organizer/events/${event.id}/attendees`).set(bearer(other.token));
    assert.equal(admin.status, 200);
  });
});

describe('concurrency: last seat', () => {
  test('five simultaneous registrations for one seat yield exactly one confirmed seat', async () => {
    const organizer = await register('Race Organizer', 'race-org@example.com', 'organizer');
    const res = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ title: 'Single Seat Race', registration: { type: 'native', capacity: 1, waitlistEnabled: false } }));
    const eventId = res.body.event.id;

    const people = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => register(`Racer ${i}`, `racer${i}@example.com`)),
    );
    const results = await Promise.all(
      people.map((p) => request(app).post(`/api/events/${eventId}/register`).set(bearer(p.token)).send(SUBMISSION)),
    );
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1, JSON.stringify(statuses));
    assert.equal(statuses.filter((s) => s === 409).length, 4);

    const detail = await request(app).get(`/api/events/${eventId}`);
    assert.equal(detail.body.event.registeredCount, 1);
    assert.equal(detail.body.event.registration.seatsLeft, 0);
  });
});

describe('eligibility and event rules', () => {
  let organizer;
  before(async () => {
    organizer = await register('Age Organizer', 'age-org@example.com', 'organizer');
  });

  test('age-gated events require a date of birth and enforce the minimum age', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ title: '18+ Hackathon', minAge: 18, registration: { type: 'native', capacity: null, waitlistEnabled: false } }));
    const id = created.body.event.id;

    const noDob = await register('No Dob', 'nodob@example.com', 'participant', null);
    const noDobRes = await request(app).post(`/api/events/${id}/register`).set(bearer(noDob.token)).send(SUBMISSION);
    assert.equal(noDobRes.status, 422);

    const minor = await register('Minor Teen', 'minor@example.com', 'participant', '2012-05-01');
    const minorRes = await request(app).post(`/api/events/${id}/register`).set(bearer(minor.token)).send(SUBMISSION);
    assert.equal(minorRes.status, 403);

    const adult = await register('Adult User', 'adult@example.com', 'participant', '1999-03-10');
    const adultRes = await request(app).post(`/api/events/${id}/register`).set(bearer(adult.token)).send(SUBMISSION);
    assert.equal(adultRes.status, 201);
  });

  test('external-registration events refuse native registration but count outbound handoffs', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({
        title: 'Partner Hackathon',
        mode: 'online',
        venue: null,
        onlineUrl: 'https://example.org/join',
        registration: { type: 'external', externalUrl: 'https://partner.example.org/register', capacity: null, waitlistEnabled: false },
      }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.event.id;

    const member = await register('Handoff User', 'handoff@example.com');
    const native = await request(app).post(`/api/events/${id}/register`).set(bearer(member.token)).send(SUBMISSION);
    assert.equal(native.status, 400);

    const handoff = await request(app).post(`/api/events/${id}/handoff`);
    assert.equal(handoff.status, 200);
    assert.equal(handoff.body.externalUrl, 'https://partner.example.org/register');

    const detail = await request(app).get(`/api/events/${id}`).set(bearer(organizer.token));
    assert.equal(detail.body.event.externalHandoffs, 1);
    assert.equal(detail.body.event.registeredCount, 0);
  });

  test('validation: end before start and in-person events without a location are rejected', async () => {
    const badTimes = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ startAt: future(5), endAt: future(4) }));
    assert.equal(badTimes.status, 400);
    assert.match(badTimes.body.error + JSON.stringify(badTimes.body.details ?? ''), /end time|after/i);

    const noVenue = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ venue: null }));
    assert.equal(noVenue.status, 400);
  });

  test('draft events are hidden from guests but visible to their organizer', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ title: 'Secret Draft Session', status: 'draft' }));
    const id = created.body.event.id;
    assert.equal((await request(app).get(`/api/events/${id}`)).status, 404);
    assert.equal((await request(app).get(`/api/events/${id}`).set(bearer(organizer.token))).status, 200);
  });

  test('cancelling an event notifies registrants and closes registration', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ title: 'Event To Cancel', registration: { type: 'native', capacity: null, waitlistEnabled: false } }));
    const id = created.body.event.id;
    const attendee = await register('Cancel Attendee', 'cancel-attendee@example.com');
    await request(app).post(`/api/events/${id}/register`).set(bearer(attendee.token)).send(SUBMISSION);

    const cancelled = await request(app)
      .post(`/api/events/${id}/cancel`)
      .set(bearer(organizer.token))
      .send({ reason: 'Venue flooded' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.event.status, 'cancelled');

    const notes = await request(app).get('/api/notifications').set(bearer(attendee.token));
    assert.ok(notes.body.items.some((n) => n.type === 'system' && n.body === 'Venue flooded'));

    const late = await request(app).post(`/api/events/${id}/register`).set(bearer(attendee.token)).send(SUBMISSION);
    assert.equal(late.status, 409);
  });

  test('material changes to time or venue notify confirmed attendees', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ title: 'Reschedule Me', registration: { type: 'native', capacity: null, waitlistEnabled: false } }));
    const id = created.body.event.id;
    const attendee = await register('Reschedule Attendee', 'resched@example.com');
    await request(app).post(`/api/events/${id}/register`).set(bearer(attendee.token)).send(SUBMISSION);

    const patched = await request(app)
      .patch(`/api/events/${id}`)
      .set(bearer(organizer.token))
      .send({ startAt: future(6), endAt: future(6, 2) });
    assert.equal(patched.status, 200);
    const notes = await request(app).get('/api/notifications').set(bearer(attendee.token));
    assert.ok(notes.body.items.some((n) => n.type === 'change'));
  });
});

describe('discovery and geo search', () => {
  let organizer;
  before(async () => {
    organizer = await register('Geo Organizer', 'geo-org@example.com', 'organizer');
    await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({
      title: 'Koramangala Robotics',
      interests: ['robotics'],
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    }));
    await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({
      title: 'Mysuru Heritage Walk',
      interests: ['arts'],
      venue: { name: 'Palace', address: 'Mysuru', localityId: null, lat: 12.3052, lng: 76.6552 },
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    }));
    await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({
      title: 'Global Online AI Call',
      mode: 'online',
      venue: null,
      onlineUrl: 'https://example.org/call',
      interests: ['ai-ml'],
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    }));
  });

  test('radius search keeps nearby events and online events, drops distant ones', async () => {
    const res = await request(app).get('/api/events').query({ lat: 12.9352, lng: 77.6245, radiusKm: 10, sort: 'distance' });
    assert.equal(res.status, 200);
    const titles = res.body.items.map((e) => e.title);
    assert.ok(titles.includes('Koramangala Robotics'));
    assert.ok(titles.includes('Global Online AI Call'));
    assert.ok(!titles.includes('Mysuru Heritage Walk'));
    const near = res.body.items.find((e) => e.title === 'Koramangala Robotics');
    assert.ok(near.distanceKm < 1);
  });

  test('text search, interest filter and price filter combine', async () => {
    const byText = await request(app).get('/api/events').query({ q: 'robotics' });
    assert.ok(byText.body.items.every((e) => /robotics/i.test(JSON.stringify(e))));
    const byInterest = await request(app).get('/api/events').query({ interest: 'ai-ml' });
    assert.ok(byInterest.body.items.some((e) => e.title === 'Global Online AI Call'));
    const paid = await request(app).get('/api/events').query({ price: 'paid' });
    assert.equal(paid.body.total, 0);
  });

  test('regex metacharacters in search text do not break the query', async () => {
    const res = await request(app).get('/api/events').query({ q: '(.*' });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });

  test('ICS export is a calendar attachment with the event and a link back to Knot', async () => {
    const list = await request(app).get('/api/events').query({ q: 'Koramangala Robotics' });
    const id = list.body.items[0].id;
    const res = await request(app).get(`/api/events/${id}/ics`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/calendar/);
    assert.match(res.text, /BEGIN:VEVENT/);
    assert.match(res.text, /SUMMARY:Koramangala Robotics/);
    assert.match(res.text, new RegExp(`/events/${id}`));
  });

  test('localities endpoint lists seeded neighbourhoods and supports search', async () => {
    await models.Locality.create({ _id: 'koramangala', name: 'Koramangala', city: 'Bengaluru', country: 'IN', lat: 12.9357, lng: 77.6241 });
    const res = await request(app).get('/api/localities').query({ q: 'kora' });
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].id, 'koramangala');
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.match(res.body.error, /No API route/);
  });
});

describe('plan, schedule conflicts and saved events', () => {
  test('overlapping confirmed registrations produce a conflict warning in the plan', async () => {
    const organizer = await register('Plan Organizer', 'plan-org@example.com', 'organizer');
    const a = await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({
      title: 'Morning Talk',
      startAt: future(10),
      endAt: future(10, 2),
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    }));
    const b = await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({
      title: 'Overlapping Workshop',
      startAt: future(10, 1),
      endAt: future(10, 3),
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
    }));
    const student = await register('Plan Student', 'plan-student@example.com');
    await request(app).post(`/api/events/${a.body.event.id}/register`).set(bearer(student.token)).send(SUBMISSION);
    await request(app).post(`/api/events/${b.body.event.id}/register`).set(bearer(student.token)).send(SUBMISSION);
    await request(app).put(`/api/events/${b.body.event.id}/save`).set(bearer(student.token));

    const plan = await request(app).get('/api/users/me/plan').set(bearer(student.token));
    assert.equal(plan.body.registrations.length, 2);
    assert.equal(plan.body.conflicts.length, 1);
    assert.equal(plan.body.conflicts[0].overlapMinutes, 60);
    assert.equal(plan.body.saved.length, 1);
  });

  test('saving and unsaving an event updates the user profile', async () => {
    const organizer = await register('Save Organizer', 'save-org@example.com', 'organizer');
    const created = await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody({ title: 'Saveable Event' }));
    const user = await register('Saver', 'saver@example.com');
    const id = created.body.event.id;
    assert.equal((await request(app).put(`/api/events/${id}/save`).set(bearer(user.token))).status, 200);
    let me = await request(app).get('/api/auth/me').set(bearer(user.token));
    assert.deepEqual(me.body.user.savedEventIds, [id]);
    await request(app).delete(`/api/events/${id}/save`).set(bearer(user.token));
    me = await request(app).get('/api/auth/me').set(bearer(user.token));
    assert.deepEqual(me.body.user.savedEventIds, []);
  });

  test('profile update validates locality and interests', async () => {
    const user = await register('Profile User', 'profile@example.com');
    const bad = await request(app).patch('/api/users/me').set(bearer(user.token)).send({ localityId: 'atlantis' });
    assert.equal(bad.status, 400);
    const ok = await request(app).patch('/api/users/me').set(bearer(user.token)).send({ localityId: 'koramangala', interests: ['ai-ml'], dateOfBirth: '1995-02-02' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.localityId, 'koramangala');
    assert.equal(ok.body.user.dateOfBirth.slice(0, 10), '1995-02-02');
  });
});

describe('admin', () => {
  test('only admins reach admin endpoints; role changes take effect immediately', async () => {
    const admin = await register('Admin Person', 'admin-person@example.com');
    await models.User.updateOne({ email: 'admin-person@example.com' }, { role: 'admin' });
    const user = await register('Plain User', 'plain@example.com');

    assert.equal((await request(app).get('/api/admin/stats').set(bearer(user.token))).status, 403);
    const stats = await request(app).get('/api/admin/stats').set(bearer(admin.token));
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.users >= 2);

    const promoted = await request(app)
      .patch(`/api/admin/users/${user.user.id}/role`)
      .set(bearer(admin.token))
      .send({ role: 'organizer' });
    assert.equal(promoted.status, 200);
    const organizerStats = await request(app).get('/api/organizer/stats').set(bearer(user.token));
    assert.equal(organizerStats.status, 200);
  });
});
