import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createCheckInToken, checkInPayload, parseCheckInPayload, CHECK_IN_PAYLOAD_PREFIX } from '../src/utils/checkin.js';
import { newPassToken } from '../src/utils/tokens.js';
import { nextSeriesDate, cloneEventFields } from '../src/utils/series.js';

describe('pass and check-in tokens', () => {
  test('tokens are 48 hex characters and round-trip through the QR payload', () => {
    const token = createCheckInToken();
    assert.match(token, /^[a-f0-9]{48}$/);
    assert.equal(newPassToken().length, 48);
    assert.equal(parseCheckInPayload(checkInPayload(token)), token);
    assert.equal(CHECK_IN_PAYLOAD_PREFIX, 'knot:checkin:v1:');
  });

  test('manual codes are accepted in any case and surrounding spaces; junk is rejected', () => {
    const token = createCheckInToken();
    assert.equal(parseCheckInPayload(`  ${token.toUpperCase()} `), token);
    assert.equal(parseCheckInPayload('knot:checkin:v1:xyz'), null);
    assert.equal(parseCheckInPayload('https://example.org'), null);
    assert.equal(parseCheckInPayload(''), null);
  });
});

describe('series automation', () => {
  test('weekly occurrences add seven days', () => {
    assert.equal(nextSeriesDate('2026-12-05T13:00:00.000Z', 'weekly'), '2026-12-12T13:00:00.000Z');
  });

  test('monthly occurrences keep the day and clamp to short months', () => {
    assert.equal(nextSeriesDate('2027-01-31T10:00:00.000Z', 'monthly'), '2027-02-28T10:00:00.000Z');
    assert.equal(nextSeriesDate('2026-11-15T10:00:00.000Z', 'monthly'), '2026-12-15T10:00:00.000Z');
  });

  test('cloning shifts times, resets counters and does not copy participant data', () => {
    const organizer = '6b02ddaa4c29ee8ce8f9db01';
    const template = {
      title: 'Monthly Robotics Meetup',
      summary: 'Build night',
      eventType: 'meetup',
      mode: 'in_person',
      interests: ['robotics'],
      organizer,
      organizerName: 'Knot Organizer',
      startAt: new Date('2026-11-05T13:00:00.000Z'),
      endAt: new Date('2026-11-05T15:00:00.000Z'),
      registrationDeadline: new Date('2026-11-05T10:00:00.000Z'),
      status: 'published',
      registeredCount: 40,
      checkedInCount: 12,
      registration: { type: 'native', capacity: 50, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      venue: { name: 'Startup Hub', localityId: 'koramangala', lat: 12.93, lng: 77.62 },
    };
    const clone = cloneEventFields(template, '2026-12-05T13:00:00.000Z');
    assert.equal(clone.status, 'draft');
    assert.equal(clone.startAt.toISOString(), '2026-12-05T13:00:00.000Z');
    assert.equal(clone.endAt.toISOString(), '2026-12-05T15:00:00.000Z');
    assert.equal(clone.registrationDeadline.toISOString(), '2026-12-05T10:00:00.000Z');
    assert.equal(clone.registeredCount, 0);
    assert.equal(clone.checkedInCount, 0);
    assert.equal(clone.registration.capacity, 50);
    assert.notEqual(clone.interests, template.interests);
    assert.notEqual(clone.venue, template.venue);
  });

  test('cloning an unowned template is refused', () => {
    assert.throws(() => cloneEventFields({ startAt: new Date(), title: 'x' }, new Date()), /owned template/);
  });
});
