import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, teardownTestDb, future, bearer } from './helpers.js';
import { checkSubmission, formDefinitionErrors } from '../src/utils/registrationForm.js';

let app;

async function signUp(name, email, role = 'participant') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Password123', role, dateOfBirth: '2000-01-01' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, user: res.body.user };
}

const registrationForm = {
  type: 'native',
  capacity: 2,
  waitlistEnabled: true,
  teamMin: 2,
  teamMax: 3,
  declaration: 'I will follow the hackathon rules and share my project on the day.',
  questions: [
    { key: 'college', label: 'College or company', type: 'text', required: true, options: [] },
    { key: 'track', label: 'Track', type: 'choice', required: true, options: ['AI', 'Web', 'Hardware'] },
    { key: 'repo', label: 'Project repository', type: 'url', required: false, options: [] },
    { key: 'year', label: 'Year of study', type: 'number', required: false, options: [] },
  ],
};

function eventBody(overrides = {}) {
  return {
    title: 'Form Test Hackathon',
    summary: 'Team registration with questions',
    description: 'Details',
    eventType: 'hackathon',
    mode: 'in_person',
    interests: ['ai-ml'],
    startAt: future(4),
    endAt: future(4, 8),
    venue: { name: 'Hub', address: 'Block 5', localityId: 'koramangala', lat: 12.9357, lng: 77.6241 },
    registration: registrationForm,
    price: { kind: 'free', amountInr: 0 },
    minAge: 0,
    ...overrides,
  };
}

/** A complete, valid submission for the test form (team of two). */
function validSubmission(overrides = {}) {
  return {
    profile: { name: 'Asha Rao', phone: '+91 98450 12345', organisation: 'RVCE' },
    team: { name: 'Byte Crew', members: [{ name: 'Ravi Kumar', email: 'ravi@example.org' }] },
    answers: [
      { key: 'college', value: 'RVCE, Bengaluru' },
      { key: 'track', value: 'AI' },
      { key: 'repo', value: 'https://github.com/example/project' },
      { key: 'year', value: 3 },
    ],
    consent: { terms: true, dataSharing: true },
    ...overrides,
  };
}

let organizer;
let eventId;

before(async () => {
  ({ app } = await setupTestDb());
  organizer = await signUp('Olivia Organizer', 'form-organizer@knot.test', 'organizer');
  const res = await request(app).post('/api/events').set(bearer(organizer.token)).send(eventBody());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  eventId = res.body.event.id;
});

after(async () => {
  await teardownTestDb();
});

describe('registration form definition', () => {
  test('the form is published on the event so the client can draw the steps', async () => {
    const res = await request(app).get(`/api/events/${eventId}`);
    assert.equal(res.status, 200);
    const form = res.body.event.registration.form;
    assert.equal(form.teamMin, 2);
    assert.equal(form.teamMax, 3);
    assert.deepEqual(form.questions.map((q) => q.key), ['college', 'track', 'repo', 'year']);
    assert.match(form.declaration, /hackathon rules/);
  });

  test('a team range whose minimum exceeds its maximum is refused', async () => {
    const res = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ registration: { ...registrationForm, teamMin: 4, teamMax: 3 } }));
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body.details), /smallest team/);
  });

  test('a choice question without two options is refused', async () => {
    const questions = [{ key: 'track', label: 'Track', type: 'choice', required: true, options: ['Only one'] }];
    const res = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ registration: { ...registrationForm, questions } }));
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body.details), /at least two options/);
  });

  test('duplicate question keys are refused', async () => {
    const questions = [
      { key: 'x', label: 'One', type: 'text' },
      { key: 'x', label: 'Two', type: 'text' },
    ];
    const res = await request(app)
      .post('/api/events')
      .set(bearer(organizer.token))
      .send(eventBody({ registration: { ...registrationForm, questions } }));
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body.details), /unique key/);
  });

  test('the pure definition check reports a team on an external event', () => {
    const errors = formDefinitionErrors({ type: 'external', teamMin: 2, teamMax: 4, questions: [] });
    assert.equal(errors.length, 1);
  });
});

describe('registration submission', () => {
  test('an empty submission is refused with field errors', async () => {
    const user = await signUp('Empty Form', 'empty-form@knot.test');
    const res = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.details.length > 0);
  });

  test('without accepting the terms the registration is refused and no seat is taken', async () => {
    const user = await signUp('No Consent', 'no-consent@knot.test');
    const res = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set(bearer(user.token))
      .send(validSubmission({ consent: { terms: false, dataSharing: false } }));
    assert.equal(res.status, 422);
    assert.ok(res.body.details.some((d) => d.path === 'consent.terms'));
    const detail = await request(app).get(`/api/events/${eventId}`).set(bearer(organizer.token));
    assert.equal(detail.body.event.registration.seatsLeft, 2);
  });

  test('a missing required answer names the question', async () => {
    const user = await signUp('No College', 'no-college@knot.test');
    const submission = validSubmission({ answers: [{ key: 'track', value: 'Web' }] });
    const res = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send(submission);
    assert.equal(res.status, 422);
    assert.ok(res.body.details.some((d) => d.path === 'answers.college' && /required/.test(d.message)));
  });

  test('a choice outside the listed options, a bad link and a non-number are refused', async () => {
    const user = await signUp('Bad Answers', 'bad-answers@knot.test');
    const submission = validSubmission({
      answers: [
        { key: 'college', value: 'RVCE' },
        { key: 'track', value: 'Quantum' },
        { key: 'repo', value: 'github.com/no-scheme' },
        { key: 'year', value: 'third' },
      ],
    });
    const res = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send(submission);
    assert.equal(res.status, 422);
    const paths = res.body.details.map((d) => d.path);
    assert.ok(paths.includes('answers.track'));
    assert.ok(paths.includes('answers.repo'));
    assert.ok(paths.includes('answers.year'));
  });

  test('a team outside the allowed size is refused, and a missing team too', async () => {
    const user = await signUp('Team Size', 'team-size@knot.test');
    const tooBig = validSubmission({
      team: {
        name: 'Crowd',
        members: [1, 2, 3].map((n) => ({ name: `Member ${n}`, email: '' })),
      },
    });
    const big = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send(tooBig);
    assert.equal(big.status, 422);
    assert.ok(big.body.details.some((d) => d.path === 'team.members'));

    const noTeam = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set(bearer(user.token))
      .send(validSubmission({ team: null }));
    assert.equal(noTeam.status, 422);
    assert.ok(noTeam.body.details.some((d) => d.path === 'team.name'));
  });

  test('a refused submission does not hold a seat; a valid one then takes it', async () => {
    const user = await signUp('Retry Person', 'retry@knot.test');
    const bad = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send({});
    assert.equal(bad.status, 400);
    const good = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send(validSubmission());
    assert.equal(good.status, 201, JSON.stringify(good.body));
    assert.equal(good.body.registration.status, 'confirmed');
  });

  test('the organizer sees the team, answers and consent in the attendee list and CSV', async () => {
    const user = await signUp('Organizer View', 'organizer-view@knot.test');
    const res = await request(app).post(`/api/events/${eventId}/register`).set(bearer(user.token)).send(validSubmission());
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const list = await request(app).get(`/api/organizer/events/${eventId}/attendees`).set(bearer(organizer.token));
    const row = list.body.attendees.find((a) => a.email === 'organizer-view@knot.test');
    assert.equal(row.team, 'Byte Crew');
    assert.equal(row.organisation, 'RVCE');
    assert.equal(row.dataSharing, 'yes');
    assert.ok(row.answers.some((a) => a.label === 'Track' && a.value === 'AI'));

    const csv = await request(app).get(`/api/organizer/events/${eventId}/attendees.csv`).set(bearer(organizer.token));
    assert.match(csv.text.split('\r\n')[0], /Team,Team members,Agreed to share details,Answers/);
    assert.match(csv.text, /Track: AI/);
  });

  test('a person who cancels and registers again sends a fresh submission that replaces the old one', async () => {
    const user = await signUp('Rejoin Person', 'rejoin@knot.test');
    await request(app)
      .post(`/api/events/${eventId}/register`)
      .set(bearer(user.token))
      .send(validSubmission({ profile: { name: 'Asha Rao', phone: '', organisation: 'Old College' } }));
    await request(app).delete(`/api/events/${eventId}/register`).set(bearer(user.token));
    const again = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set(bearer(user.token))
      .send(validSubmission({ profile: { name: 'Asha Rao', phone: '', organisation: 'New College' }, team: { name: 'Second Team', members: [{ name: 'Priya Nair', email: '' }] } }));
    assert.equal(again.status, 201, JSON.stringify(again.body));

    const list = await request(app).get(`/api/organizer/events/${eventId}/attendees`).set(bearer(organizer.token));
    const rows = list.body.attendees.filter((a) => a.email === 'rejoin@knot.test');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].organisation, 'New College');
    assert.equal(rows[0].team, 'Second Team');
  });
});

describe('checkSubmission rules', () => {
  test('an individual event drops any team that was sent', () => {
    const clean = checkSubmission(
      { teamMin: 0, teamMax: 0, questions: [] },
      { profile: { name: 'Solo Person' }, team: { name: 'Ignored', members: [] }, answers: [], consent: { terms: true } },
      new Date('2026-11-22T06:00:00Z'),
    );
    assert.equal(clean.team, undefined);
    assert.equal(clean.consent.acceptedAt.toISOString(), '2026-11-22T06:00:00.000Z');
  });
});
