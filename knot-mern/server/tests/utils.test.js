import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, boundingBox } from '../src/utils/geo.js';
import { buildIcs, escapeIcsText, foldLine } from '../src/utils/ics.js';
import { toCsv } from '../src/utils/csv.js';
import { findScheduleConflicts } from '../src/utils/schedule.js';
import { ageOn } from '../src/utils/age.js';
import { escapeRegex } from '../src/utils/text.js';
import { hasVenue } from '../src/utils/serialize.js';

describe('geo', () => {
  test('haversine: Koramangala to Indiranagar is roughly 4-5 km', () => {
    const d = haversineKm(12.9357366, 77.624081, 12.9732913, 77.6403);
    assert.ok(d > 3.5 && d < 5.5, `got ${d}`);
  });

  test('haversine: zero distance for identical points', () => {
    assert.equal(haversineKm(12.97, 77.59, 12.97, 77.59), 0);
  });

  test('bounding box contains a point exactly radiusKm away on the north axis', () => {
    const box = boundingBox(12.97, 77.59, 10);
    assert.ok(box.maxLat >= 12.97 + 10 / 111);
    assert.ok(box.minLng < 77.59 && box.maxLng > 77.59);
  });
});

describe('ics', () => {
  const event = {
    id: 'abc123',
    title: 'Node, React; and Mongo',
    summary: 'Line one\nLine two',
    startAt: '2026-12-01T10:30:00.000Z',
    endAt: '2026-12-01T12:00:00.000Z',
    mode: 'in_person',
    venue: { name: 'Hub', address: '5th Block' },
  };

  test('builds a valid VCALENDAR with escaped text and UTC times', () => {
    const ics = buildIcs(event, { url: 'http://localhost/events/abc123', now: new Date('2026-11-22T00:00:00Z') });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261201T103000Z/);
    assert.match(ics, /DTEND:20261201T120000Z/);
    assert.match(ics, /SUMMARY:Node\\, React\\; and Mongo/);
    assert.match(ics, /DESCRIPTION:Line one\\nLine two\\nhttp/);
    assert.match(ics, /LOCATION:Hub\\, 5th Block/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
  });

  test('defaults the end time to two hours after start when missing', () => {
    const ics = buildIcs({ ...event, endAt: null }, { now: new Date('2026-11-22T00:00:00Z') });
    assert.match(ics, /DTEND:20261201T123000Z/);
  });

  test('folds long lines at 75 octets with leading-space continuations', () => {
    const folded = foldLine('x'.repeat(200));
    for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  });

  test('escapeIcsText escapes separators and newlines', () => {
    assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  });
});

describe('csv', () => {
  test('quotes commas and quotes, and neutralises spreadsheet formulas', () => {
    const csv = toCsv(
      [{ name: 'Asha "A", Rao', email: '=HYPERLINK("x")' }],
      [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
      ],
    );
    assert.equal(csv.split('\r\n')[0], 'Name,Email');
    assert.match(csv, /"Asha ""A"", Rao"/);
    assert.match(csv, /'=HYPERLINK/);
  });
});

describe('schedule conflicts', () => {
  test('detects overlapping confirmed sessions with overlap minutes', () => {
    const conflicts = findScheduleConflicts([
      { id: 'a', title: 'A', startAt: '2026-12-01T10:00:00Z', endAt: '2026-12-01T12:00:00Z' },
      { id: 'b', title: 'B', startAt: '2026-12-01T11:30:00Z', endAt: '2026-12-01T13:00:00Z' },
      { id: 'c', title: 'C', startAt: '2026-12-01T13:00:00Z', endAt: '2026-12-01T14:00:00Z' },
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].overlapMinutes, 30);
    assert.equal(conflicts[0].first.id, 'a');
    assert.equal(conflicts[0].second.id, 'b');
  });

  test('touching times are not a conflict; missing end assumes two hours', () => {
    const conflicts = findScheduleConflicts([
      { id: 'a', title: 'A', startAt: '2026-12-01T10:00:00Z', endAt: '2026-12-01T11:00:00Z' },
      { id: 'b', title: 'B', startAt: '2026-12-01T11:00:00Z', endAt: '2026-12-01T12:00:00Z' },
      { id: 'c', title: 'C', startAt: '2026-12-01T11:30:00Z', endAt: null },
    ]);
    assert.ok(conflicts.every((c) => c.first.id !== 'a' || c.second.id !== 'b'));
    assert.ok(conflicts.some((c) => c.second.id === 'c' || c.first.id === 'c'));
  });
});

describe('age and text helpers', () => {
  test('ageOn counts whole years and respects the birthday', () => {
    const dob = new Date('2010-06-15T00:00:00Z');
    assert.equal(ageOn(dob, new Date('2026-06-14T23:00:00Z')), 15);
    assert.equal(ageOn(dob, new Date('2026-06-15T00:00:00Z')), 16);
  });

  test('escapeRegex neutralises regex metacharacters', () => {
    const re = new RegExp(escapeRegex('c++ (beginner)?'));
    assert.ok(re.test('Intro to c++ (beginner)?'));
    assert.ok(!re.test('cpp'));
  });

  test('hasVenue is false for an empty venue', () => {
    assert.equal(hasVenue({ name: '', address: '', localityId: null, lat: null }), false);
    assert.equal(hasVenue({ name: 'Hub', lat: null }), true);
  });
});
