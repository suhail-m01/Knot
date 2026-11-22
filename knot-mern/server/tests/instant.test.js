import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstantText } from '../src/utils/instantParser.js';
import { textSearchScore, editDistanceWithin } from '../src/utils/search.js';
import { findDuplicateCandidates, normalizeUrl, normalizeTitle, istDay } from '../src/utils/dedupe.js';

const NOW = new Date('2026-11-22T06:00:00Z');

describe('instant add parser', () => {
  test('reads an explicit IST date and time without shifting the day', () => {
    const { fields } = parseInstantText('Title: Robotics Night\nDate: 5 Dec 2026 6:30 PM\nVenue: Startup Hub', NOW);
    assert.equal(fields.title.value, 'Robotics Night');
    // 6:30 PM IST on 5 Dec is 13:00 UTC on 5 Dec.
    assert.equal(fields.startAt.value, '2026-12-05T13:00:00.000Z');
    assert.equal(fields.startAt.confidence, 'high');
  });

  test('a day-month date without a year is medium confidence and rolls to the next year when past', () => {
    const { fields } = parseInstantText('Hackathon kickoff\n3/2 Bengaluru', NOW);
    assert.equal(fields.startAt.confidence, 'medium');
    assert.equal(istDay(fields.startAt.value), '2027-02-03');
  });

  test('a conditional "free for students" price stays unknown, never free', () => {
    const { fields, form } = parseInstantText('Workshop for everyone\nFree for students only\nDate: 1 Jan 2027', NOW);
    assert.equal(fields.price.value.kind, 'unknown');
    assert.equal(form.priceKind, 'unknown');
  });

  test('an explicit rupee amount becomes a paid price with that amount', () => {
    const { form } = parseInstantText('Summit 2027\nTicket: ₹1,500\nDate: 10 Feb 2027', NOW);
    assert.equal(form.priceKind, 'paid');
    assert.equal(form.priceAmount, 1500);
  });

  test('missing price is unknown and not converted to free', () => {
    const { form } = parseInstantText('Community session in Indiranagar\nDate: 2 Mar 2027', NOW);
    assert.equal(form.priceKind, 'unknown');
    assert.equal(form.priceAmount, null);
  });

  test('a labelled registration link becomes the external registration URL', () => {
    const { form } = parseInstantText('Open Source Day\nRegister: https://example.org/reg/42\nDate: 9 Jan 2027', NOW);
    assert.equal(form.externalUrl, 'https://example.org/reg/42');
  });

  test('an age range is extracted; class wording is low confidence and gives no age', () => {
    const range = parseInstantText('Kids robotics\nAges 10-14\nDate: 1 Feb 2027', NOW);
    assert.equal(range.fields.age.value.minAge, 10);
    assert.equal(range.fields.age.value.maxAge, 14);
    const classy = parseInstantText('Class 9 science fair\nDate: 1 Feb 2027', NOW);
    assert.equal(classy.fields.age.value.minAge, null);
    assert.equal(classy.fields.age.confidence, 'low');
  });

  test('event type is recognised, and unknown text yields null rather than guesses', () => {
    assert.equal(parseInstantText('Bengaluru AI Hackathon 2027\nDate: 1 Mar 2027', NOW).form.eventType, 'hackathon');
    const bare = parseInstantText('Nothing useful here at all.', NOW);
    assert.equal(bare.form.startAt, null);
    assert.equal(bare.form.eventType, '');
  });
});

describe('typo-tolerant text search', () => {
  test('a one-letter typo still matches the title word', () => {
    assert.ok(textSearchScore(['Bengaluru AI Hackathon'], 'hakathon') > 0);
  });

  test('an unrelated query scores zero', () => {
    assert.equal(textSearchScore(['Bengaluru AI Hackathon'], 'pottery'), 0);
  });

  test('exact phrases outrank partial matches', () => {
    const exact = textSearchScore(['Open Source Saturday'], 'open source');
    const partial = textSearchScore(['Open Source Saturday'], 'open');
    assert.ok(exact >= partial);
  });

  test('every query token must match', () => {
    assert.equal(textSearchScore(['Robotics build night'], 'robotics pottery'), 0);
  });

  test('edit distance respects the bound', () => {
    assert.equal(editDistanceWithin('kitten', 'sitting', 3), true);
    assert.equal(editDistanceWithin('kitten', 'sitting', 2), false);
  });
});

describe('duplicate detection', () => {
  const base = {
    _id: 'a1',
    title: 'Bengaluru AI Builders Night',
    startAt: new Date('2026-11-24T13:00:00Z'),
    mode: 'in_person',
    venue: { localityId: 'koramangala' },
    registration: { externalUrl: null },
    onlineUrl: null,
    status: 'published',
  };

  test('normalises URLs by dropping query and trailing slash', () => {
    assert.equal(normalizeUrl('https://Example.org/reg/42/?utm=1'), 'example.org/reg/42');
  });

  test('normalises titles by punctuation and case', () => {
    assert.equal(normalizeTitle('Bengaluru AI—Builders!  Night'), 'bengaluru ai builders night');
  });

  test('same title, same IST day and same locality is a duplicate', () => {
    const candidate = { ...base, _id: undefined, title: 'bengaluru ai builders night!' };
    assert.equal(findDuplicateCandidates(candidate, [base]).length, 1);
  });

  test('same title on a different day is not a duplicate', () => {
    const candidate = { ...base, _id: undefined, startAt: new Date('2026-12-01T13:00:00Z') };
    assert.equal(findDuplicateCandidates(candidate, [base]).length, 0);
  });

  test('the same registration URL is a duplicate regardless of title', () => {
    const other = { ...base, _id: 'b2', title: 'Different', registration: { externalUrl: 'https://ex.org/x?a=1' } };
    const candidate = { ...base, _id: undefined, title: 'Other', registration: { externalUrl: 'https://ex.org/x' } };
    assert.equal(findDuplicateCandidates(candidate, [other]).length, 1);
  });

  test('an event is never reported as its own duplicate', () => {
    assert.equal(findDuplicateCandidates(base, [base]).length, 0);
  });
});

describe('instant add regressions', () => {
  test('an age range next to a real date does not hide the date', () => {
    const { fields } = parseInstantText('Robotics for kids\nAges 10-14\nDate: 5 Dec 2026 6:30 PM', NOW);
    assert.equal(fields.startAt.value, '2026-12-05T13:00:00.000Z');
    assert.equal(fields.age.value.minAge, 10);
  });

  test('a labelled "Price: Free" line is read as free', () => {
    const { fields } = parseInstantText('Title: Open Mic Night\nPrice: Free', NOW);
    assert.equal(fields.price.value.kind, 'free');
  });
});
