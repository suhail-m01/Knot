import { istInputFromIso } from './format.js';

/**
 * Maps a parsed Instant Add draft onto the event form state. Only values that were confidently
 * extracted are carried over. Unknown price stays "Not stated"; a missing age is not turned into
 * a rule, so the review screen asks the organiser to confirm it.
 */
export function formFromDraft(form) {
  const isExternal = Boolean(form.externalUrl);
  return {
    title: form.title || '',
    summary: form.summary || '',
    description: '',
    eventType: form.eventType || 'meetup',
    mode: form.mode || 'in_person',
    interests: [],
    startAt: istInputFromIso(form.startAt),
    endAt: istInputFromIso(form.endAt),
    registrationDeadline: istInputFromIso(form.registrationDeadline),
    venueName: form.venueName || '',
    venueAddress: '',
    onlineUrl: form.onlineUrl || '',
    regType: isExternal ? 'external' : 'native',
    externalUrl: form.externalUrl || '',
    capacity: '',
    waitlistEnabled: true,
    priceKind: form.priceKind || 'unknown',
    priceAmount: form.priceKind === 'paid' && form.priceAmount != null ? String(form.priceAmount) : '',
    minAge: form.minAge ?? 0,
    status: 'draft',
  };
}

/** Human-readable notes about what still needs the organiser's attention before saving. */
export function reviewNotes(form, fields) {
  const notes = [];
  if (!form.startAt) notes.push('No start date was found. Enter one in the form.');
  if (form.minAge == null) notes.push('No age rule was stated. The form defaults to all ages, so confirm this before publishing.');
  if (form.priceKind === 'unknown') notes.push('The price was not stated. It is saved as "Not stated" unless you change it.');
  if (fields?.registrationUrl?.value) notes.push('A registration link was found, so the event will use an external handoff, not native registration.');
  notes.push('Choose the correct locality in the form. Knot cannot know it from the text alone.');
  return notes;
}
